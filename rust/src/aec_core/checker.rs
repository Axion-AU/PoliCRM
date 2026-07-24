use std::collections::HashMap;
use std::fs::{File, OpenOptions};
use std::io::{BufWriter, Write};
use std::sync::Arc;

use anyhow::{Context, Result};
use indicatif::{ProgressBar, ProgressStyle};
use parking_lot::Mutex;
use tokio::sync::mpsc;
use tracing::{error, info, warn};

use crate::aec_core::browser::{get_aec_status, get_driver, MAX_RETRIES};
use crate::aec_core::models::{AecResult, OUTPUT_FIELDS};
use crate::aec_core::utils::validate_membership_data;

/// CLI arguments for the batch AEC checker
#[derive(Debug, Clone)]
pub struct CheckerArgs {
    pub infile: String,
    pub outfile: String,
    pub skip: usize,
    pub threads: usize,
    pub headless: bool,
    pub dry_run: bool,
    pub nationbuilder_base: String,
}

/// Run the batch AEC enrollment checker.
pub async fn run_checker(args: CheckerArgs) -> Result<()> {
    if args.dry_run {
        info!("Running in DRY-RUN mode — validating input data only");
        return validate_input_file(&args.infile).await;
    }

    // Read and validate input CSV
    let rows = read_input_csv(&args.infile, args.skip)?;
    let total = rows.len();

    if total == 0 {
        println!("No rows to process.");
        return Ok(());
    }

    println!(
        "Processing {} rows with {} thread(s)...",
        total, args.threads
    );

    // Set up progress bar
    let pb = Arc::new(ProgressBar::new(total as u64));
    pb.set_style(
        ProgressStyle::default_bar()
            .template("{spinner:.green} [{elapsed_precise}] [{bar:40.cyan/blue}] {pos}/{len} ({eta})")?
            .progress_chars("#>-"),
    );

    // Set up output CSV writer (thread-safe)
    let output_exists = std::path::Path::new(&args.outfile).exists();
    let outfile = OpenOptions::new()
        .create(true)
        .append(true)
        .open(&args.outfile)
        .with_context(|| format!("Cannot open output file: {}", args.outfile))?;

    let writer = Arc::new(Mutex::new(BufWriter::new(outfile)));

    // Write header if file is new
    if !output_exists {
        let mut w = writer.lock();
        writeln!(w, "{}", OUTPUT_FIELDS.join(","))?;
    }

    // Stats counter (thread-safe)
    let stats: Arc<Mutex<HashMap<String, usize>>> = Arc::new(Mutex::new(HashMap::new()));

    // Work channel
    let (tx, _rx) = mpsc::channel::<HashMap<String, Option<String>>>(total.max(1));
    let tx = Arc::new(Mutex::new(tx));

    // Spawn worker tasks
    let mut handles = Vec::new();
    let threads = args.threads.max(1);

    // We need one receiver per worker — use a broadcast-style approach with a shared queue
    // Use a tokio::sync::Mutex<VecDeque> as shared work queue
    let work_queue: Arc<tokio::sync::Mutex<std::collections::VecDeque<HashMap<String, Option<String>>>>> =
        Arc::new(tokio::sync::Mutex::new(rows.into_iter().collect()));

    for worker_id in 0..threads {
        let queue = Arc::clone(&work_queue);
        let writer_clone = Arc::clone(&writer);
        let stats_clone = Arc::clone(&stats);
        let pb_clone = Arc::clone(&pb);
        let headless = args.headless;
        let nb_base = args.nationbuilder_base.clone();

        let handle = tokio::spawn(async move {
            // Initialize WebDriver for this worker
            let driver = match get_driver(headless).await {
                Ok(d) => d,
                Err(e) => {
                    error!("Worker {} failed to init driver: {}", worker_id, e);
                    return;
                }
            };

            if let Err(e) = driver.goto("https://check.aec.gov.au/").await {
                error!("Worker {} failed to load AEC page: {}", worker_id, e);
                let _ = driver.quit().await;
                return;
            }

            let mut consecutive_failures = 0usize;
            const MAX_CONSECUTIVE_FAILURES: usize = 5;

            loop {
                // Pop next item from shared queue
                let row = {
                    let mut q = queue.lock().await;
                    q.pop_front()
                };

                let row = match row {
                    Some(r) => r,
                    None => break, // Queue empty
                };

                // Check driver is still alive
                if driver.current_url().await.is_err() {
                    warn!("Worker {} driver died, attempting recovery...", worker_id);
                    if let Err(e) = driver.goto("https://check.aec.gov.au/").await {
                        error!("Worker {} could not recover: {}", worker_id, e);
                        // Re-enqueue and quit
                        let mut q = queue.lock().await;
                        q.push_back(row);
                        break;
                    }
                }

                let name = format!(
                    "{} {}",
                    row.get("first_name").and_then(|v| v.as_deref()).unwrap_or("?"),
                    row.get("last_name").and_then(|v| v.as_deref()).unwrap_or("?")
                );
                let nb_id = row
                    .get("nationbuilder_id")
                    .and_then(|v| v.as_deref())
                    .unwrap_or("0")
                    .to_string();

                let status = get_aec_status(&driver, &row, MAX_RETRIES).await;

                if status.result == AecResult::Pass {
                    consecutive_failures = 0;
                } else {
                    consecutive_failures += 1;
                    if consecutive_failures >= MAX_CONSECUTIVE_FAILURES {
                        warn!(
                            "Worker {} has {} consecutive failures, resetting driver...",
                            worker_id, consecutive_failures
                        );
                        let _ = driver.goto("https://check.aec.gov.au/").await;
                        consecutive_failures = 0;
                    }
                }

                // Build output row
                let nb_link = format!("{}{}", nb_base, nb_id);
                let output_values: Vec<String> = OUTPUT_FIELDS
                    .iter()
                    .map(|field| match *field {
                        "AEC_result" => status.result.to_string(),
                        "federal_division" => status.federal.clone().unwrap_or_default(),
                        "state_division" => status.state.clone().unwrap_or_default(),
                        "local_government" => status.local_gov.clone().unwrap_or_default(),
                        "local_ward" => status.local_ward.clone().unwrap_or_default(),
                        "nationbuilder_link" => nb_link.clone(),
                        other => row
                            .get(other)
                            .and_then(|v| v.as_deref())
                            .unwrap_or("")
                            .to_string(),
                    })
                    .collect();

                // Write to output (CSV-safe: quote fields containing commas)
                let csv_row = output_values
                    .iter()
                    .map(|v| csv_quote(v))
                    .collect::<Vec<_>>()
                    .join(",");

                {
                    let mut w = writer_clone.lock();
                    if let Err(e) = writeln!(w, "{}", csv_row) {
                        error!("Failed to write output row: {}", e);
                    }
                    let _ = w.flush();
                }

                // Update stats
                {
                    let mut s = stats_clone.lock();
                    *s.entry(status.result.to_string()).or_insert(0) += 1;
                }

                pb_clone.inc(1);
                info!("Worker {} — {} ({}): {}", worker_id, name, nb_id, status.result);
            }

            let _ = driver.quit().await;
            info!("Worker {} finished.", worker_id);
        });

        handles.push(handle);
    }

    // Drop the unused tx to avoid holding a reference
    drop(tx);

    // Wait for all workers to complete
    for handle in handles {
        let _ = handle.await;
    }

    pb.finish_with_message("Done!");

    // Flush output writer
    {
        let mut w = writer.lock();
        let _ = w.flush();
    }

    // Print stats table
    println!("\n=== Verification Statistics ===");
    println!("{:<20} {}", "Result", "Count");
    println!("{:-<30}", "");
    let stats_locked = stats.lock();
    let mut stats_vec: Vec<_> = stats_locked.iter().collect();
    stats_vec.sort_by_key(|(k, _)| k.as_str());
    for (result, count) in &stats_vec {
        println!("{:<20} {}", result, count);
    }
    println!("{:-<30}", "");
    let total_processed: usize = stats_vec.iter().map(|(_, &c)| c).sum();
    println!("{:<20} {}", "Total", total_processed);

    Ok(())
}

/// Validate the input CSV file without running checks.
pub async fn validate_input_file(infile: &str) -> Result<()> {
    let file = File::open(infile).with_context(|| format!("Cannot open input file: {}", infile))?;
    let mut rdr = csv::Reader::from_reader(file);

    let headers = rdr
        .headers()
        .with_context(|| "Failed to read CSV headers")?
        .clone();

    let required_fields = ["first_name", "last_name", "nationbuilder_id", "primary_address1", "primary_city", "primary_state"];
    for field in &required_fields {
        if !headers.iter().any(|h| h == *field) {
            println!("ERROR: Missing required field: {}", field);
        }
    }

    let mut validation_errors: Vec<String> = Vec::new();
    let mut valid_count = 0usize;
    let mut invalid_count = 0usize;

    for (idx, result) in rdr.records().enumerate() {
        let record = match result {
            Ok(r) => r,
            Err(e) => {
                validation_errors.push(format!("Row {}: CSV parse error: {}", idx + 2, e));
                invalid_count += 1;
                continue;
            }
        };

        let row: HashMap<String, Option<String>> = headers
            .iter()
            .zip(record.iter())
            .map(|(h, v)| {
                let val = if v.trim().is_empty() {
                    None
                } else {
                    Some(v.trim().to_string())
                };
                (h.to_string(), val)
            })
            .collect();

        match validate_membership_data(&row) {
            Ok(()) => valid_count += 1,
            Err(e) => {
                let name = format!(
                    "{} {}",
                    row.get("first_name").and_then(|v| v.as_deref()).unwrap_or("?"),
                    row.get("last_name").and_then(|v| v.as_deref()).unwrap_or("?")
                );
                validation_errors.push(format!("Row {} ({}): {}", idx + 2, name, e));
                invalid_count += 1;
            }
        }
    }

    // Print summary
    println!("\n=== Validation Summary ===");
    println!("{:<25} {}", "Valid Records", valid_count);
    println!("{:<25} {}", "Invalid Records", invalid_count);

    if !validation_errors.is_empty() {
        println!(
            "\nFound {} validation issue(s):",
            validation_errors.len()
        );
        for error in validation_errors.iter().take(20) {
            println!("  - {}", error);
        }
        if validation_errors.len() > 20 {
            println!("  ... and {} more", validation_errors.len() - 20);
        }
    } else {
        println!("\nAll records passed validation!");
    }

    Ok(())
}

/// Read input CSV, skipping the first `skip` data rows.
/// Returns rows as Vec<HashMap<String, Option<String>>>.
fn read_input_csv(
    infile: &str,
    skip: usize,
) -> Result<Vec<HashMap<String, Option<String>>>> {
    let file = File::open(infile).with_context(|| format!("Cannot open input file: {}", infile))?;
    let mut rdr = csv::Reader::from_reader(file);
    let headers = rdr.headers()?.clone();

    let mut rows = Vec::new();

    for (idx, result) in rdr.records().enumerate() {
        if idx < skip {
            continue;
        }

        let record = match result {
            Ok(r) => r,
            Err(e) => {
                warn!("Skipping row {}: parse error: {}", idx + 2, e);
                continue;
            }
        };

        let row: HashMap<String, Option<String>> = headers
            .iter()
            .zip(record.iter())
            .map(|(h, v)| {
                let val = if v.trim().is_empty() {
                    None
                } else {
                    Some(v.trim().to_string())
                };
                (h.to_string(), val)
            })
            .collect();

        // Skip rows with no first_name
        if row.get("first_name").and_then(|v| v.as_deref()).is_none() {
            continue;
        }

        rows.push(row);
    }

    Ok(rows)
}

/// Quote a CSV field value if it contains commas, quotes, or newlines.
fn csv_quote(value: &str) -> String {
    if value.contains(',') || value.contains('"') || value.contains('\n') {
        format!("\"{}\"", value.replace('"', "\"\""))
    } else {
        value.to_string()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    // ─── csv_quote ───────────────────────────────────────────────────────────

    #[test]
    fn test_csv_quote_plain_value_unchanged() {
        assert_eq!(csv_quote("hello"), "hello");
        assert_eq!(csv_quote("John Smith"), "John Smith");
        assert_eq!(csv_quote("Pass"), "Pass");
    }

    #[test]
    fn test_csv_quote_empty_string_unchanged() {
        assert_eq!(csv_quote(""), "");
    }

    #[test]
    fn test_csv_quote_value_with_comma_gets_quoted() {
        assert_eq!(csv_quote("Smith, John"), "\"Smith, John\"");
    }

    #[test]
    fn test_csv_quote_value_with_double_quote_gets_escaped() {
        assert_eq!(csv_quote("say \"hello\""), "\"say \"\"hello\"\"\"");
    }

    #[test]
    fn test_csv_quote_value_with_newline_gets_quoted() {
        assert_eq!(csv_quote("line1\nline2"), "\"line1\nline2\"");
    }

    #[test]
    fn test_csv_quote_multiple_commas() {
        let quoted = csv_quote("a,b,c");
        assert_eq!(quoted, "\"a,b,c\"");
    }

    #[test]
    fn test_csv_quote_combined_comma_and_quote() {
        // Contains both comma and double-quote
        let val = "Smith, \"John\"";
        let quoted = csv_quote(val);
        assert!(quoted.starts_with('"'));
        assert!(quoted.ends_with('"'));
        // Inner double-quotes should be doubled per RFC 4180
        assert!(quoted.contains("\"\""));
    }

    #[test]
    fn test_csv_quote_value_with_numbers_unchanged() {
        assert_eq!(csv_quote("12345"), "12345");
    }

    #[test]
    fn test_csv_quote_slash_unchanged() {
        assert_eq!(csv_quote("10/12 Main St"), "10/12 Main St");
    }

    #[test]
    fn test_csv_quote_only_whitespace_unchanged() {
        assert_eq!(csv_quote("   "), "   ");
    }

    // ─── CheckerArgs struct ──────────────────────────────────────────────────

    #[test]
    fn test_checker_args_clone() {
        let args = CheckerArgs {
            infile: "input.csv".to_string(),
            outfile: "output.csv".to_string(),
            skip: 5,
            threads: 2,
            headless: true,
            dry_run: false,
            nationbuilder_base: "https://app.nationbuilder.com".to_string(),
        };
        let cloned = args.clone();
        assert_eq!(cloned.infile, "input.csv");
        assert_eq!(cloned.skip, 5);
        assert_eq!(cloned.threads, 2);
        assert!(cloned.headless);
        assert!(!cloned.dry_run);
    }

    #[test]
    fn test_checker_args_debug_format() {
        let args = CheckerArgs {
            infile: "in.csv".to_string(),
            outfile: "out.csv".to_string(),
            skip: 0,
            threads: 1,
            headless: false,
            dry_run: true,
            nationbuilder_base: "https://nb.example.com".to_string(),
        };
        let debug_str = format!("{:?}", args);
        assert!(debug_str.contains("in.csv"));
        assert!(debug_str.contains("dry_run: true"));
    }
}
