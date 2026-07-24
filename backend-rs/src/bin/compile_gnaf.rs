use std::collections::HashMap;
use std::fs::File;
use std::io::{BufRead, BufReader};
use std::path::{Path, PathBuf};
use futures_util::StreamExt;
use reqwest::Client;
use serde::Deserialize;
use sqlx::sqlite::SqlitePoolOptions;
use std::time::Instant;

#[derive(Deserialize, Debug)]
struct Resource {
    format: String,
    name: String,
    url: String,
}

#[derive(Deserialize, Debug)]
struct PackageResult {
    resources: Vec<Resource>,
}

#[derive(Deserialize, Debug)]
struct PackageShowResponse {
    success: bool,
    result: PackageResult,
}

#[derive(Debug, Clone)]
struct StreetInfo {
    name: String,
    type_code: String,
    suffix_code: String,
}

fn get_memory_usage_mb() -> Option<f64> {
    if let Ok(content) = std::fs::read_to_string("/proc/self/statm") {
        let fields: Vec<&str> = content.split_whitespace().collect();
        if fields.len() > 1 {
            if let Ok(pages) = fields[1].parse::<u64>() {
                // page size is typically 4KB (4096 bytes) on Linux
                let bytes = pages * 4096;
                return Some(bytes as f64 / 1024.0 / 1024.0);
            }
        }
    }
    None
}

async fn discover_gnaf_url() -> Result<String, Box<dyn std::error::Error>> {
    // Attempt standard URL first, and if that fails try fallback URL
    let urls = [
        "https://data.gov.au/data/api/3/action/package_show?id=19432f89-dc3a-4ef3-b943-5326ef1dbecc",
        "https://data.gov.au/api/3/action/package_show?id=19432f89-dc3a-4ef3-b943-5326ef1dbecc",
    ];

    let client = Client::builder()
        .connect_timeout(std::time::Duration::from_secs(15))
        .build()?;

    let mut last_err = None;

    for api_url in &urls {
        println!("Querying CKAN API at: {}...", api_url);
        match client.get(*api_url).send().await {
            Ok(resp) => {
                if resp.status().is_success() {
                    match resp.json::<PackageShowResponse>().await {
                        Ok(data) => {
                            if data.success {
                                if let Some(res) = data.result.resources.iter().find(|r| {
                                    r.format.to_uppercase() == "ZIP"
                                        && r.name.to_uppercase().contains("G-NAF")
                                }) {
                                    println!("Found matching resource: '{}' at {}", res.name, res.url);
                                    return Ok(res.url.clone());
                                }
                            }
                        }
                        Err(e) => {
                            last_err = Some(format!("JSON parsing failed: {}", e));
                        }
                    }
                } else {
                    last_err = Some(format!("HTTP status error: {}", resp.status()));
                }
            }
            Err(e) => {
                last_err = Some(format!("Request failed: {}", e));
            }
        }
    }

    Err(format!(
        "Failed to discover G-NAF download URL. Last error: {:?}",
        last_err
    )
    .into())
}

async fn download_gnaf_zip(url: &str, dest_path: &str) -> Result<(), Box<dyn std::error::Error>> {
    let client = Client::builder()
        .connect_timeout(std::time::Duration::from_secs(30))
        .timeout(std::time::Duration::from_secs(3600)) // 1 hour maximum timeout
        .build()?;

    const MAX_RETRIES: u32 = 3;
    let mut attempt = 0;

    loop {
        attempt += 1;
        println!(
            "Starting stream download of G-NAF ZIP (Attempt {}/{})...",
            attempt, MAX_RETRIES
        );

        match download_attempt(&client, url, dest_path).await {
            Ok(_) => {
                println!("Download completed successfully.");
                return Ok(());
            }
            Err(e) => {
                eprintln!("Download attempt {} failed: {}", attempt, e);
                if attempt >= MAX_RETRIES {
                    return Err(e);
                }
                let sleep_secs = 5 * attempt as u64;
                println!("Retrying in {} seconds...", sleep_secs);
                tokio::time::sleep(std::time::Duration::from_secs(sleep_secs)).await;
            }
        }
    }
}

async fn download_attempt(client: &Client, url: &str, dest_path: &str) -> Result<(), Box<dyn std::error::Error>> {
    let resp = client.get(url).send().await?;
    if !resp.status().is_success() {
        return Err(format!("Bad server status: {}", resp.status()).into());
    }

    let total_bytes = resp.content_length();
    let mut file = tokio::fs::File::create(dest_path).await?;
    let mut stream = resp.bytes_stream();
    let mut downloaded = 0u64;
    let mut last_report = Instant::now();

    while let Some(chunk_res) = stream.next().await {
        let chunk = chunk_res?;
        use tokio::io::AsyncWriteExt;
        file.write_all(&chunk).await?;
        downloaded += chunk.len() as u64;

        if last_report.elapsed().as_secs() >= 10 {
            if let Some(total) = total_bytes {
                let percent = (downloaded as f64 / total as f64) * 100.0;
                println!(
                    "Progress: {:.2}% ({}/{} bytes) | Mem: {:.2} MB",
                    percent,
                    downloaded,
                    total,
                    get_memory_usage_mb().unwrap_or(0.0)
                );
            } else {
                println!(
                    "Progress: {} bytes downloaded | Mem: {:.2} MB",
                    downloaded,
                    get_memory_usage_mb().unwrap_or(0.0)
                );
            }
            last_report = Instant::now();
        }
    }

    file.sync_all().await?;
    Ok(())
}

fn parse_gnaf_pid(pid: &str) -> Option<u32> {
    let num_str = pid.trim_start_matches(|c: char| !c.is_ascii_digit());
    num_str.parse::<u32>().ok()
}

fn discover_gnaf_paths(incoming_dir: &Path) -> Result<(PathBuf, PathBuf), Box<dyn std::error::Error>> {
    let gnaf_root = incoming_dir.join("G-NAF");
    if !gnaf_root.exists() {
        return Err(format!("G-NAF directory not found at {:?}", gnaf_root).into());
    }

    let mut gnaf_sub = None;
    for entry in std::fs::read_dir(&gnaf_root)? {
        let entry = entry?;
        let name = entry.file_name().to_string_lossy().into_owned();
        if entry.file_type()?.is_dir() && name.starts_with("G-NAF") {
            gnaf_sub = Some(entry.path());
            break;
        }
    }

    let gnaf_dir = gnaf_sub.ok_or("Could not locate G-NAF subfolder under gnaf_incoming/G-NAF/")?;
    let standard_dir = gnaf_dir.join("Standard");
    let authority_dir = gnaf_dir.join("Authority Code");

    if !standard_dir.exists() {
        return Err(format!("Standard directory not found at {:?}", standard_dir).into());
    }
    if !authority_dir.exists() {
        return Err(format!("Authority Code directory not found at {:?}", authority_dir).into());
    }

    Ok((standard_dir, authority_dir))
}

fn load_authority_map(base_path: &Path, filename: &str) -> HashMap<String, String> {
    let mut map = HashMap::new();
    let file_path = base_path.join(filename);
    if let Ok(file) = File::open(&file_path) {
        let reader = BufReader::new(file);
        let mut lines = reader.lines();
        if let Some(Ok(header)) = lines.next() {
            let col_code = header.split('|').position(|h| h == "CODE").unwrap_or(0);
            let col_name = header.split('|').position(|h| h == "NAME").unwrap_or(1);
            for line_res in lines {
                if let Ok(line) = line_res {
                    let fields: Vec<&str> = line.split('|').collect();
                    if fields.len() > col_code && fields.len() > col_name {
                        map.insert(fields[col_code].to_string(), fields[col_name].to_string());
                    }
                }
            }
        }
        println!("Loaded authority map: {} with {} entries", filename, map.len());
    } else {
        println!("Warning: Could not open authority file {:?}", file_path);
    }
    map
}

fn load_locality_map(standard_dir: &Path, state: &str) -> HashMap<String, String> {
    let mut map = HashMap::new();
    let filename = format!("{}_LOCALITY_psv.psv", state);
    let file_path = standard_dir.join(&filename);
    if let Ok(file) = File::open(&file_path) {
        let reader = BufReader::new(file);
        let mut lines = reader.lines();
        if let Some(Ok(header)) = lines.next() {
            let col_pid = header.split('|').position(|h| h == "LOCALITY_PID").unwrap_or(0);
            let col_name = header.split('|').position(|h| h == "LOCALITY_NAME").unwrap_or(3);
            for line_res in lines {
                if let Ok(line) = line_res {
                    let fields: Vec<&str> = line.split('|').collect();
                    if fields.len() > col_pid && fields.len() > col_name {
                        map.insert(fields[col_pid].to_string(), fields[col_name].to_string());
                    }
                }
            }
        }
        println!("Loaded locality map for {} with {} entries", state, map.len());
    } else {
        println!("Warning: Could not open locality file {:?}", file_path);
    }
    map
}

fn load_street_locality_map(standard_dir: &Path, state: &str) -> HashMap<String, StreetInfo> {
    let mut map = HashMap::new();
    let filename = format!("{}_STREET_LOCALITY_psv.psv", state);
    let file_path = standard_dir.join(&filename);
    if let Ok(file) = File::open(&file_path) {
        let reader = BufReader::new(file);
        let mut lines = reader.lines();
        if let Some(Ok(header)) = lines.next() {
            let col_pid = header.split('|').position(|h| h == "STREET_LOCALITY_PID").unwrap_or(0);
            let col_name = header.split('|').position(|h| h == "STREET_NAME").unwrap_or(4);
            let col_type = header.split('|').position(|h| h == "STREET_TYPE_CODE").unwrap_or(5);
            let col_suffix = header.split('|').position(|h| h == "STREET_SUFFIX_CODE").unwrap_or(6);
            for line_res in lines {
                if let Ok(line) = line_res {
                    let fields: Vec<&str> = line.split('|').collect();
                    if fields.len() > col_pid && fields.len() > col_name && fields.len() > col_type && fields.len() > col_suffix {
                        map.insert(
                            fields[col_pid].to_string(),
                            StreetInfo {
                                name: fields[col_name].to_string(),
                                type_code: fields[col_type].to_string(),
                                suffix_code: fields[col_suffix].to_string(),
                            },
                        );
                    }
                }
            }
        }
        println!("Loaded street locality map for {} with {} entries", state, map.len());
    } else {
        println!("Warning: Could not open street locality file {:?}", file_path);
    }
    map
}

fn load_geocode_map(standard_dir: &Path, state: &str) -> HashMap<u32, (f64, f64)> {
    let mut map = HashMap::new();
    let filename = format!("{}_ADDRESS_DEFAULT_GEOCODE_psv.psv", state);
    let file_path = standard_dir.join(&filename);
    if let Ok(file) = File::open(&file_path) {
        let reader = BufReader::new(file);
        let mut lines = reader.lines();
        if let Some(Ok(header)) = lines.next() {
            let col_detail_pid = header.split('|').position(|h| h == "ADDRESS_DETAIL_PID").unwrap_or(3);
            let col_lon = header.split('|').position(|h| h == "LONGITUDE").unwrap_or(5);
            let col_lat = header.split('|').position(|h| h == "LATITUDE").unwrap_or(6);
            for line_res in lines {
                if let Ok(line) = line_res {
                    let fields: Vec<&str> = line.split('|').collect();
                    if fields.len() > col_detail_pid && fields.len() > col_lon && fields.len() > col_lat {
                        if let Some(pid_u32) = parse_gnaf_pid(fields[col_detail_pid]) {
                            let lon = fields[col_lon].parse::<f64>().unwrap_or(0.0);
                            let lat = fields[col_lat].parse::<f64>().unwrap_or(0.0);
                            map.insert(pid_u32, (lat, lon));
                        }
                    }
                }
            }
        }
        println!("Loaded geocode map for {} with {} entries", state, map.len());
    } else {
        println!("Warning: Could not open geocode file {:?}", file_path);
    }
    map
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    dotenvy::dotenv().ok();
    let start_time = Instant::now();

    println!("PoliCRM G-NAF Local Database Compiler Pipeline starting...");
    if let Some(mem) = get_memory_usage_mb() {
        println!("Initial Resident Set Size: {:.2} MB", mem);
    }

    let incoming_dir = Path::new("gnaf_incoming");
    let gnaf_root = incoming_dir.join("G-NAF");

    if !gnaf_root.exists() {
        println!("G-NAF directory not found at {:?}. Checking for zip...", gnaf_root);
        // 1. Dynamic Asset Discovery
        let download_url = discover_gnaf_url().await?;

        // 2. Defensive Network Ingestion
        let zip_filename = "gnaf_incoming.zip";
        if !Path::new(zip_filename).exists() {
            download_gnaf_zip(&download_url, zip_filename).await?;
        } else {
            println!("Temporary ZIP file already exists, skipping download.");
        }

        // Extract ZIP
        println!("Extracting G-NAF ZIP file to {:?}...", incoming_dir);
        std::fs::create_dir_all(incoming_dir)?;
        let zip_file = std::fs::File::open(zip_filename)?;
        let mut archive = zip::ZipArchive::new(zip_file)?;
        archive.extract(incoming_dir)?;
        println!("Extraction complete.");

        // Clean up ZIP file
        let keep_zip = std::env::args().any(|arg| arg == "--keep-zip");
        if !keep_zip {
            println!("Cleaning up temporary ZIP file: {}...", zip_filename);
            let _ = std::fs::remove_file(zip_filename);
        }
    } else {
        println!("Found existing G-NAF standard folder at {:?}, skipping download/extraction.", gnaf_root);
    }

    let (standard_dir, authority_dir) = discover_gnaf_paths(incoming_dir)?;

    // 3. SQLite Connection Setup
    let db_filename = "policrm_addresses.db";
    let db_path = Path::new(db_filename);
    if db_path.exists() {
        println!("Removing existing '{}' database...", db_filename);
        std::fs::remove_file(db_path)?;
    }
    std::fs::File::create(db_path)?;

    println!("Connecting to SQLite database: {}...", db_filename);
    use sqlx::ConnectOptions;
    use sqlx::sqlite::SqliteConnectOptions;
    use std::str::FromStr;

    let mut connect_options = SqliteConnectOptions::from_str(&format!("sqlite://{}", db_filename))?
        .create_if_missing(true)
        .busy_timeout(std::time::Duration::from_secs(600));
    connect_options = connect_options.log_statements(log::LevelFilter::Off);

    let pool = SqlitePoolOptions::new()
        .max_connections(1)
        .connect_with(connect_options)
        .await?;

    let mut conn = pool.acquire().await?;

    // Apply speed optimization PRAGMAs for compilation
    println!("Applying SQLite performance optimizations...");
    sqlx::query("PRAGMA journal_mode = OFF;").execute(&mut *conn).await?;
    sqlx::query("PRAGMA synchronous = OFF;").execute(&mut *conn).await?;
    sqlx::query("PRAGMA temp_store = FILE;").execute(&mut *conn).await?;
    sqlx::query("PRAGMA locking_mode = EXCLUSIVE;").execute(&mut *conn).await?;

    // Initialize FTS5 Virtual Table
    println!("Initializing Virtual Table 'addresses_fts'...");
    sqlx::query(
        "CREATE VIRTUAL TABLE IF NOT EXISTS addresses_fts USING fts5(
            id UNINDEXED,
            address_text,
            suburb,
            postcode,
            lat UNINDEXED,
            lon UNINDEXED,
            tokenize='porter'
        );"
    )
    .execute(&mut *conn)
    .await?;

    // Load authority code lookup maps once at startup
    println!("Loading authority code tables...");
    let flat_type_map = load_authority_map(&authority_dir, "Authority_Code_FLAT_TYPE_AUT_psv.psv");
    let level_type_map = load_authority_map(&authority_dir, "Authority_Code_LEVEL_TYPE_AUT_psv.psv");
    let street_type_map = load_authority_map(&authority_dir, "Authority_Code_STREET_TYPE_AUT_psv.psv");
    let street_suffix_map = load_authority_map(&authority_dir, "Authority_Code_STREET_SUFFIX_AUT_psv.psv");

    let states = ["ACT", "NSW", "NT", "OT", "QLD", "SA", "TAS", "VIC", "WA"];
    let mut total_records_inserted = 0u64;

    for state in &states {
        println!("--------------------------------------------------");
        println!("Processing state: {}...", state);
        let state_start = Instant::now();

        // Load locality and street maps
        let locality_map = load_locality_map(&standard_dir, state);
        let street_locality_map = load_street_locality_map(&standard_dir, state);
        
        // Load geocode map (memory-optimized u32 keys)
        let geocode_map = load_geocode_map(&standard_dir, state);

        if let Some(mem) = get_memory_usage_mb() {
            println!("Memory usage after loading maps for {}: {:.2} MB", state, mem);
        }

        // Stream detail file
        let detail_filename = format!("{}_ADDRESS_DETAIL_psv.psv", state);
        let detail_path = standard_dir.join(&detail_filename);
        if !detail_path.exists() {
            println!("Warning: Detail file {:?} not found, skipping state {}.", detail_path, state);
            continue;
        }

        let detail_file = File::open(&detail_path)?;
        let mut reader = BufReader::with_capacity(256 * 1024, detail_file);

        println!("Streaming and joining address details for {}...", state);

        // Column indices resolved dynamically
        let mut idx_pid = 0;
        let mut idx_building_name = 0;
        let mut idx_flat_type = 0;
        let mut idx_flat_num = 0;
        let mut idx_level_type = 0;
        let mut idx_level_num = 0;
        let mut idx_num_first = 0;
        let mut idx_num_first_suffix = 0;
        let mut idx_num_last = 0;
        let mut idx_num_last_suffix = 0;
        let mut idx_street_pid = 0;
        let mut idx_locality_pid = 0;
        let mut idx_postcode = 0;
        let mut idx_confidence = 0;

        let mut line_buf = String::new();
        let mut header_parsed = false;
        let mut lines_processed = 0u64;
        let mut state_records_inserted = 0u64;

        sqlx::query("BEGIN TRANSACTION;").execute(&mut *conn).await?;

        while reader.read_line(&mut line_buf)? > 0 {
            let line = line_buf.trim_end();
            if line.is_empty() {
                line_buf.clear();
                continue;
            }

            if !header_parsed {
                let fields: Vec<&str> = line.split('|').collect();
                println!("Resolving columns dynamically for {}...", detail_filename);

                if let Some(pos) = fields.iter().position(|&x| x == "ADDRESS_DETAIL_PID") { idx_pid = pos; }
                if let Some(pos) = fields.iter().position(|&x| x == "BUILDING_NAME") { idx_building_name = pos; }
                if let Some(pos) = fields.iter().position(|&x| x == "FLAT_TYPE_CODE") { idx_flat_type = pos; }
                if let Some(pos) = fields.iter().position(|&x| x == "FLAT_NUMBER") { idx_flat_num = pos; }
                if let Some(pos) = fields.iter().position(|&x| x == "LEVEL_TYPE_CODE") { idx_level_type = pos; }
                if let Some(pos) = fields.iter().position(|&x| x == "LEVEL_NUMBER") { idx_level_num = pos; }
                if let Some(pos) = fields.iter().position(|&x| x == "NUMBER_FIRST") { idx_num_first = pos; }
                if let Some(pos) = fields.iter().position(|&x| x == "NUMBER_FIRST_SUFFIX") { idx_num_first_suffix = pos; }
                if let Some(pos) = fields.iter().position(|&x| x == "NUMBER_LAST") { idx_num_last = pos; }
                if let Some(pos) = fields.iter().position(|&x| x == "NUMBER_LAST_SUFFIX") { idx_num_last_suffix = pos; }
                if let Some(pos) = fields.iter().position(|&x| x == "STREET_LOCALITY_PID") { idx_street_pid = pos; }
                if let Some(pos) = fields.iter().position(|&x| x == "LOCALITY_PID") { idx_locality_pid = pos; }
                if let Some(pos) = fields.iter().position(|&x| x == "POSTCODE") { idx_postcode = pos; }
                if let Some(pos) = fields.iter().position(|&x| x == "CONFIDENCE") { idx_confidence = pos; }

                header_parsed = true;
                line_buf.clear();
                continue;
            }

            lines_processed += 1;

            let fields: Vec<&str> = line.split('|').collect();

            // Skip retired or invalid entries matching standard G-NAF view behavior
            let confidence_val = fields.get(idx_confidence).and_then(|c| c.parse::<i8>().ok()).unwrap_or(0);
            if confidence_val == -1 {
                line_buf.clear();
                continue;
            }

            let gnaf_id = fields.get(idx_pid).copied().unwrap_or("");
            let building_name = fields.get(idx_building_name).copied().unwrap_or("");
            let flat_type_code = fields.get(idx_flat_type).copied().unwrap_or("");
            let flat_num = fields.get(idx_flat_num).copied().unwrap_or("");
            let level_type_code = fields.get(idx_level_type).copied().unwrap_or("");
            let level_num = fields.get(idx_level_num).copied().unwrap_or("");
            let num_first = fields.get(idx_num_first).copied().unwrap_or("");
            let num_first_suffix = fields.get(idx_num_first_suffix).copied().unwrap_or("");
            let num_last = fields.get(idx_num_last).copied().unwrap_or("");
            let num_last_suffix = fields.get(idx_num_last_suffix).copied().unwrap_or("");
            let street_pid = fields.get(idx_street_pid).copied().unwrap_or("");
            let locality_pid = fields.get(idx_locality_pid).copied().unwrap_or("");
            let postcode = fields.get(idx_postcode).copied().unwrap_or("");

            // Look up geocode first, skip if none found (matching SQL JOIN view criteria)
            let (lat_str, lon_str) = if let Some(pid_u32) = parse_gnaf_pid(gnaf_id) {
                if let Some(&(lat_val, lon_val)) = geocode_map.get(&pid_u32) {
                    (format!("{:.8}", lat_val), format!("{:.8}", lon_val))
                } else {
                    line_buf.clear();
                    continue; // Skip if no geocode matches
                }
            } else {
                line_buf.clear();
                continue;
            };

            let mut address_parts = Vec::new();

            // 1. Building Name
            if !building_name.is_empty() {
                address_parts.push(building_name.to_string());
            }

            // 2. Level type and number
            if !level_num.is_empty() {
                let level_type = level_type_map.get(level_type_code).map(|s| s.as_str()).unwrap_or(level_type_code);
                let display_type = if level_type.is_empty() { "LEVEL" } else { level_type };
                address_parts.push(format!("{} {}", display_type, level_num));
            }

            // 3. Flat/Unit type and number
            if !flat_num.is_empty() {
                let flat_type = flat_type_map.get(flat_type_code).map(|s| s.as_str()).unwrap_or(flat_type_code);
                if !flat_type.is_empty() {
                    address_parts.push(format!("{} {}", flat_type, flat_num));
                } else {
                    address_parts.push(flat_num.to_string());
                }
            }

            // 4. Street number, street name, street type, street suffix
            let mut street_part = String::new();
            if !num_first.is_empty() {
                street_part.push_str(num_first);
                if !num_first_suffix.is_empty() {
                    street_part.push_str(num_first_suffix);
                }
                if !num_last.is_empty() {
                    street_part.push('-');
                    street_part.push_str(num_last);
                    if !num_last_suffix.is_empty() {
                        street_part.push_str(num_last_suffix);
                    }
                }
                street_part.push(' ');
            }

            // Resolve street details from street_locality map
            if let Some(street_info) = street_locality_map.get(street_pid) {
                street_part.push_str(&street_info.name);
                
                if !street_info.type_code.is_empty() {
                    let street_type = street_type_map.get(&street_info.type_code).map(|s| s.as_str()).unwrap_or(&street_info.type_code);
                    street_part.push(' ');
                    street_part.push_str(street_type);
                }
                
                if !street_info.suffix_code.is_empty() {
                    let street_suffix = street_suffix_map.get(&street_info.suffix_code).map(|s| s.as_str()).unwrap_or(&street_info.suffix_code);
                    street_part.push(' ');
                    street_part.push_str(street_suffix);
                }
            } else {
                street_part.push_str("UNKNOWN STREET");
            }

            address_parts.push(street_part);

            // Suburb
            let suburb = locality_map.get(locality_pid).map(|s| s.as_str()).unwrap_or("UNKNOWN");
            
            // Format standard presentation address text
            let address_text = format!("{}, {} {} {}", address_parts.join(", "), suburb, state, postcode);

            sqlx::query("INSERT INTO addresses_fts (id, address_text, suburb, postcode, lat, lon) VALUES (?, ?, ?, ?, ?, ?);")
                .bind(gnaf_id)
                .bind(address_text)
                .bind(suburb)
                .bind(postcode)
                .bind(lat_str)
                .bind(lon_str)
                .execute(&mut *conn)
                .await?;

            state_records_inserted += 1;

            if state_records_inserted % 10000 == 0 {
                sqlx::query("COMMIT;").execute(&mut *conn).await?;
                sqlx::query("BEGIN TRANSACTION;").execute(&mut *conn).await?;
            }

            if lines_processed % 500000 == 0 {
                let mem_str = get_memory_usage_mb()
                    .map(|m| format!("{:.2} MB", m))
                    .unwrap_or_else(|| "N/A".to_string());
                println!(
                    "  [{}] Processed {} lines | Inserts: {} | Heap RAM: {}",
                    state, lines_processed, state_records_inserted, mem_str
                );
            }

            line_buf.clear();
        }

        // Commit state records
        sqlx::query("COMMIT;").execute(&mut *conn).await?;
        total_records_inserted += state_records_inserted;

        let state_elapsed = state_start.elapsed();
        println!(
            "Completed {} in {:.2} seconds. Inserted {} addresses.",
            state, state_elapsed.as_secs_f64(), state_records_inserted
        );
    }

    println!("--------------------------------------------------");
    println!("All states parsed successfully.");
    println!("Total addresses inserted: {}", total_records_inserted);

    // Run optimize on FTS5 virtual table
    println!("Optimizing FTS5 indices...");
    sqlx::query("INSERT INTO addresses_fts(addresses_fts) VALUES('optimize');")
        .execute(&mut *conn)
        .await?;

    // Verify DB exists and check table counts
    let row_count: (i64,) = sqlx::query_as("SELECT count(*) FROM addresses_fts;")
        .fetch_one(&mut *conn)
        .await?;
    println!("Verification: addresses_fts count = {}", row_count.0);

    drop(conn);
    pool.close().await;

    let elapsed = start_time.elapsed();
    println!("G-NAF Compiler Pipeline completed in {:.2} seconds.", elapsed.as_secs_f64());
    if let Some(mem) = get_memory_usage_mb() {
        println!("Final Resident Set Size: {:.2} MB", mem);
    }

    Ok(())
}
