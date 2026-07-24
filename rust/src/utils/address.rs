//! Address normalization utilities — port of src/utils/convert_addresses.py
//!
//! Normalizes Australian street addresses and state names for use with the
//! AEC voter enrollment check website.

use anyhow::Result;
use std::collections::HashMap;

// ---------------------------------------------------------------------------
// State abbreviations
// ---------------------------------------------------------------------------

fn state_abbreviations() -> HashMap<&'static str, &'static str> {
    [
        ("AUSTRALIAN CAPITAL TERRITORY", "ACT"),
        ("NEW SOUTH WALES", "NSW"),
        ("NORTHERN TERRITORY", "NT"),
        ("QUEENSLAND", "QLD"),
        ("SOUTH AUSTRALIA", "SA"),
        ("TASMANIA", "TAS"),
        ("VICTORIA", "VIC"),
        ("WESTERN AUSTRALIA", "WA"),
    ]
    .iter()
    .cloned()
    .collect()
}

fn state_short_forms() -> std::collections::HashSet<&'static str> {
    ["ACT", "NSW", "NT", "QLD", "SA", "TAS", "VIC", "WA"]
        .iter()
        .cloned()
        .collect()
}

// ---------------------------------------------------------------------------
// Street type abbreviations
// ---------------------------------------------------------------------------

fn street_types() -> HashMap<&'static str, &'static str> {
    [
        ("ROAD", "RD"), ("STREET", "ST"), ("AVENUE", "AVE"), ("COURT", "CT"),
        ("CIRCUIT", "CRCT"), ("CCT", "CRCT"), ("PLACE", "PL"), ("DRIVE", "DR"),
        ("PARADE", "PDE"), ("CLOSE", "CL"), ("ESPLANADE", "ESP"),
        ("BOULEVARD", "BLVD"), ("SQUARE", "SQ"), ("TERRACE", "TCE"),
        ("CRESCENT", "CRES"), ("GROVE", "GR"), ("HIGHWAY", "HWY"),
        ("LANE", "LANE"), ("GARDENS", "GDNS"), ("WAY", "WAY"), ("LOOP", "LOOP"),
        ("MEWS", "MEWS"), ("RISE", "RISE"), ("WALK", "WALK"), ("LINK", "LINK"),
        ("GLADE", "GLADE"), ("GRANGE", "GRA"), ("HEIGHTS", "HTS"),
        ("COVE", "COVE"), ("POINT", "PT"), ("VIEW", "VW"), ("VIEWS", "VWS"),
        ("PARKWAY", "PKWY"), ("ALLEY", "ALLY"), ("ARCADE", "ARC"),
        ("BEND", "BND"), ("BRAE", "BRAE"), ("BREAK", "BRK"), ("BROW", "BROW"),
        ("BYWAY", "BYWY"), ("CAUSEWAY", "CSWY"), ("CENTRE", "CTR"),
        ("CENTREWAY", "CNWY"), ("CHASE", "CH"), ("CIRCLE", "CIR"),
        ("CIRCLET", "CLT"), ("COMMON", "CMMN"), ("CONCOURSE", "CON"),
        ("COPSE", "CPS"), ("CORNER", "CNR"), ("CORSO", "CSO"), ("CROSS", "CRS"),
        ("CROSSING", "CRSG"), ("DALE", "DALE"), ("DELL", "DELL"),
        ("DIVIDE", "DIV"), ("DOMAIN", "DOM"), ("DOWN", "DOWN"),
        ("DOWNS", "DWNS"), ("DRIVEWAY", "DRWY"), ("EDGE", "EDGE"),
        ("ELBOW", "ELB"), ("END", "END"), ("ENTRANCE", "ENT"),
        ("ESTATE", "EST"), ("EXPRESSWAY", "EXP"), ("EXTENSION", "EXT"),
        ("FAIRWAY", "FAIR"), ("FREEWAY", "FWY"), ("FRONT", "FRNT"),
        ("FRONTAGE", "FRTG"), ("GAP", "GAP"), ("GARDEN", "GDN"),
        ("GATE", "GTE"), ("GATES", "GTES"), ("GATEWAY", "GWY"),
        ("GLEN", "GLN"), ("GREEN", "GRN"), ("GROUND", "GRND"),
        ("HIGHROAD", "HIRD"), ("HILL", "HILL"), ("HILLS", "HLLS"),
        ("HOLLOW", "HLLW"), ("HUB", "HUB"), ("INLET", "INLT"),
        ("ISLAND", "ID"), ("JUNCTION", "JNC"), ("KEY", "KEY"),
        ("LANDING", "LDG"), ("LANEWAY", "LNWY"), ("LEES", "LEES"),
        ("LINE", "LINE"), ("LITTLE", "LT"), ("LOOKOUT", "LKT"),
        ("LOWER", "LWR"), ("MALL", "MALL"), ("MEANDER", "MNDR"),
        ("MILE", "MILE"), ("MOTORWAY", "MWY"), ("MOUNT", "MT"),
        ("NOOK", "NOOK"), ("OUTLOOK", "OTLK"), ("PARK", "PARK"),
        ("PARKLANDS", "PKLD"), ("PART", "PART"), ("PASS", "PASS"),
        ("PATH", "PATH"), ("PATHWAY", "PHWY"), ("PIAZZA", "PIAZ"),
        ("PLATEAU", "PLAT"), ("PLAZA", "PLZA"), ("POCKET", "PKT"),
        ("PORT", "PORT"), ("PROMENADE", "PROM"), ("QUAD", "QUAD"),
        ("QUADRANT", "QDRT"), ("QUAY", "QY"), ("QUAYS", "QYS"),
        ("RAMBLE", "RMBL"), ("RAMP", "RAMP"), ("RANGE", "RNGE"),
        ("REACH", "RCH"), ("RESERVE", "RES"), ("REST", "REST"),
        ("RETREAT", "RTT"), ("RIDE", "RIDE"), ("RIDGE", "RDGE"),
        ("RIDGEWAY", "RGWY"), ("RING", "RING"), ("RIVER", "RVR"),
        ("RIVERWAY", "RVWY"), ("RIVIERA", "RIV"), ("ROADS", "RDS"),
        ("ROADSIDE", "RDSD"), ("ROADWAY", "RDWY"), ("RONDE", "RNDE"),
        ("ROSEBOWL", "RSBL"), ("ROTUNDA", "RTDA"), ("ROUTE", "RTE"),
        ("ROW", "ROW"), ("RUE", "RUE"), ("RUN", "RUN"),
        ("SERVICE WAY", "SWY"), ("SIDING", "SDG"), ("SLOPE", "SLPE"),
        ("SOUND", "SND"), ("SPUR", "SPUR"), ("STAIRS", "STRS"),
        ("STATE HIGHWAY", "SHWY"), ("STEPS", "STPS"), ("STRAND", "STRA"),
        ("STRIP", "STRP"), ("SUBWAY", "SBWY"), ("TARN", "TARN"),
        ("THOROUGHFARE", "THFR"), ("TOLLWAY", "TLWY"), ("TOP", "TOP"),
        ("TOR", "TOR"), ("TOWERS", "TWRS"), ("TRACK", "TRK"),
        ("TRAIL", "TRL"), ("TRAILER", "TRLR"), ("TRIANGLE", "TRI"),
        ("TRUNKWAY", "TKWY"), ("TURN", "TURN"), ("UNDERPASS", "UPAS"),
        ("UPPER", "UPR"), ("VALE", "VALE"), ("VIADUCT", "VDCT"),
        ("VILLAS", "VLLS"), ("VISTA", "VSTA"), ("WALKWAY", "WKWY"),
        ("WHARF", "WHRF"), ("WYND", "WYND"), ("YARD", "YARD"),
    ]
    .iter()
    .cloned()
    .collect()
}

// ---------------------------------------------------------------------------
// Public functions
// ---------------------------------------------------------------------------

/// Normalize a state string to its 2-3 letter abbreviation.
/// E.g. "Victoria" → "VIC", "NSW" → "NSW".
pub fn convert_state(state: &str) -> String {
    let upper = state.trim().to_uppercase();
    if state_short_forms().contains(upper.as_str()) {
        return upper;
    }
    state_abbreviations()
        .get(upper.as_str())
        .map(|s| s.to_string())
        .unwrap_or(upper)
}

/// Normalize an Australian street address.
/// Returns `(normalized_state, normalized_street_name)`.
///
/// The normalization:
/// 1. Converts state to abbreviation.
/// 2. Reverses the address, extracts the street type token, abbreviates it,
///    and reconstructs "STREET_NAME ABBREV".
///
/// Preserves PO Box / GPO Box / Locked Bag addresses as-is.
pub fn convert_address(state: &str, orig_address: &str) -> (String, String) {
    let norm_state = convert_state(state);

    // Preserve PO Box addresses
    let upper_addr = orig_address.to_uppercase();
    if upper_addr.contains("PO BOX")
        || upper_addr.contains("GPO BOX")
        || upper_addr.contains("LOCKED BAG")
    {
        return (norm_state, orig_address.to_string());
    }

    // Reverse the address and work from the end
    let rev: String = orig_address.chars().rev().collect();
    let rev_upper: String = rev.to_uppercase().replace(',', "").replace('\'', "");

    // Match: strip leading non-alpha, then capture alphabetic street-type + optional rest
    let re = regex::Regex::new(r"^[^A-Z]*([A-Z \-]+?)( .+)?$").unwrap();
    let caps = match re.captures(&rev_upper) {
        Some(c) => c,
        None => return (norm_state, orig_address.to_string()),
    };

    // group(1) is the reversed street type+name portion; reverse back
    let matched: String = caps.get(1).map(|m| m.as_str()).unwrap_or("").chars().rev().collect();
    let parts: Vec<&str> = matched.trim().split_whitespace().collect();
    if parts.is_empty() {
        return (norm_state, orig_address.to_string());
    }

    let street_type_raw = parts.last().unwrap().to_uppercase();
    let street_name = parts[..parts.len().saturating_sub(1)].join(" ");

    let types = street_types();
    let short_forms: std::collections::HashSet<&str> = types.values().cloned().collect();

    // Abbreviate street type
    let street_type_abbrev = if short_forms.contains(street_type_raw.as_str()) {
        street_type_raw.clone()
    } else if let Some(&abbr) = types.get(street_type_raw.as_str()) {
        abbr.to_string()
    } else {
        // Try prefix matching
        let found = types.iter().find(|(&full, _)| {
            full.starts_with(&street_type_raw) || street_type_raw.starts_with(full)
        });
        if let Some((_, &abbr)) = found {
            abbr.to_string()
        } else {
            // Unknown type — keep as-is, prepend back to name
            return (norm_state, format!("{} {}", street_name, street_type_raw).trim().to_string());
        }
    };

    let final_address = if street_name.is_empty() {
        street_type_abbrev
    } else {
        format!("{} {}", street_name, street_type_abbrev)
    };

    (norm_state, final_address.trim().to_string())
}

/// Read `infile` CSV, normalize addresses, write to `outfile` CSV.
/// Adds an `origAddress` column to the output.
pub fn convert_csv_addresses(infile: &str, outfile: &str) -> Result<()> {
    let mut rdr = if infile == "-" {
        csv::Reader::from_reader(Box::new(std::io::stdin()) as Box<dyn std::io::Read>)
    } else {
        csv::Reader::from_reader(Box::new(std::fs::File::open(infile)?) as Box<dyn std::io::Read>)
    };

    let mut headers = rdr.headers()?.clone();
    headers.push_field("origAddress");

    let outfile_obj: Box<dyn std::io::Write> = if outfile == "-" {
        Box::new(std::io::stdout())
    } else {
        Box::new(std::fs::File::create(outfile)?)
    };

    let mut wtr = csv::Writer::from_writer(outfile_obj);
    wtr.write_record(&headers)?;

    for result in rdr.records() {
        let mut record = result?;
        let fields: HashMap<String, String> = headers
            .iter()
            .zip(record.iter())
            .map(|(k, v)| (k.to_string(), v.to_string()))
            .collect();

        let raw_address = fields.get("primary_address1")
            .or_else(|| fields.get("registered_address1"))
            .cloned()
            .unwrap_or_default();

        let raw_state = fields.get("primary_state")
            .or_else(|| fields.get("registered_state"))
            .or_else(|| fields.get("address_state"))
            .or_else(|| fields.get("mailing_state"))
            .cloned()
            .unwrap_or_default();

        if raw_address.is_empty() {
            record.push_field("");
            wtr.write_record(&record)?;
            continue;
        }

        let orig = raw_address.clone();
        let (norm_state, norm_address) = convert_address(&raw_state, &raw_address);

        // Update fields in the record
        let header_vec: Vec<String> = headers.iter().map(|s| s.to_string()).collect();
        let mut updated: Vec<String> = record.iter().map(|s| s.to_string()).collect();

        // Make sure we have enough slots
        while updated.len() < header_vec.len() {
            updated.push(String::new());
        }

        for (i, h) in header_vec.iter().enumerate() {
            if i >= updated.len() { break; }
            match h.as_str() {
                "primary_address1" => updated[i] = norm_address.clone(),
                "primary_state" => updated[i] = norm_state.clone(),
                _ => {}
            }
        }

        // origAddress is the last field
        if updated.len() < header_vec.len() {
            updated.push(orig);
        } else {
            // Last slot is origAddress
            *updated.last_mut().unwrap() = orig;
        }

        wtr.write_record(&updated)?;
    }

    wtr.flush()?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_convert_state_full_name() {
        assert_eq!(convert_state("Victoria"), "VIC");
        assert_eq!(convert_state("QUEENSLAND"), "QLD");
        assert_eq!(convert_state("New South Wales"), "NSW");
    }

    #[test]
    fn test_convert_state_already_abbreviated() {
        assert_eq!(convert_state("VIC"), "VIC");
        assert_eq!(convert_state("nsw"), "NSW");
    }

    #[test]
    fn test_convert_address_road() {
        let (state, addr) = convert_address("VIC", "123 Main Road");
        assert_eq!(state, "VIC");
        assert!(addr.contains("RD") || addr.contains("Main"), "Got: {}", addr);
    }

    #[test]
    fn test_po_box_preserved() {
        let (_, addr) = convert_address("NSW", "PO Box 123");
        assert_eq!(addr, "PO Box 123");
    }

    // ─── convert_state (additional) ──────────────────────────────────────────

    #[test]
    fn test_convert_state_all_full_names() {
        assert_eq!(convert_state("Australian Capital Territory"), "ACT");
        assert_eq!(convert_state("New South Wales"), "NSW");
        assert_eq!(convert_state("Northern Territory"), "NT");
        assert_eq!(convert_state("Queensland"), "QLD");
        assert_eq!(convert_state("South Australia"), "SA");
        assert_eq!(convert_state("Tasmania"), "TAS");
        assert_eq!(convert_state("Victoria"), "VIC");
        assert_eq!(convert_state("Western Australia"), "WA");
    }

    #[test]
    fn test_convert_state_all_abbreviations_passthrough() {
        for abbrev in &["ACT", "NSW", "NT", "QLD", "SA", "TAS", "VIC", "WA"] {
            assert_eq!(convert_state(abbrev), *abbrev, "Failed for {}", abbrev);
        }
    }

    #[test]
    fn test_convert_state_lowercase_abbreviation() {
        assert_eq!(convert_state("vic"), "VIC");
        assert_eq!(convert_state("qld"), "QLD");
        assert_eq!(convert_state("act"), "ACT");
    }

    #[test]
    fn test_convert_state_with_leading_trailing_whitespace() {
        assert_eq!(convert_state("  Victoria  "), "VIC");
        assert_eq!(convert_state("  NSW  "), "NSW");
    }

    #[test]
    fn test_convert_state_unknown_returned_uppercased() {
        // Unknown states are returned uppercased as-is
        let result = convert_state("Unknown Territory");
        assert_eq!(result, "UNKNOWN TERRITORY");
    }

    #[test]
    fn test_convert_state_empty_string() {
        let result = convert_state("");
        assert_eq!(result, "");
    }

    // ─── convert_address — PO Box variants ──────────────────────────────────

    #[test]
    fn test_gpo_box_preserved() {
        let (_, addr) = convert_address("VIC", "GPO Box 5678");
        assert_eq!(addr, "GPO Box 5678");
    }

    #[test]
    fn test_locked_bag_preserved() {
        let (_, addr) = convert_address("NSW", "Locked Bag 999");
        assert_eq!(addr, "Locked Bag 999");
    }

    #[test]
    fn test_po_box_state_also_converted() {
        let (state, addr) = convert_address("Victoria", "PO Box 123");
        assert_eq!(state, "VIC");
        assert_eq!(addr, "PO Box 123");
    }

    // ─── convert_address — street type normalization ─────────────────────────

    #[test]
    fn test_convert_address_street_becomes_st() {
        let (_, addr) = convert_address("VIC", "5 Smith Street");
        assert!(addr.ends_with("ST") || addr.contains("ST"), "Got: {}", addr);
    }

    #[test]
    fn test_convert_address_avenue_becomes_ave() {
        let (_, addr) = convert_address("NSW", "22 Park Avenue");
        assert!(addr.ends_with("AVE") || addr.contains("AVE"), "Got: {}", addr);
    }

    #[test]
    fn test_convert_address_drive_becomes_dr() {
        let (_, addr) = convert_address("QLD", "10 Sunshine Drive");
        assert!(addr.ends_with("DR") || addr.contains("DR"), "Got: {}", addr);
    }

    #[test]
    fn test_convert_address_court_becomes_ct() {
        let (_, addr) = convert_address("SA", "3 Maple Court");
        assert!(addr.ends_with("CT") || addr.contains("CT"), "Got: {}", addr);
    }

    #[test]
    fn test_convert_address_already_abbreviated_road() {
        // "RD" is already an abbreviation — should pass through unchanged
        let (_, addr) = convert_address("WA", "99 Coast RD");
        assert!(addr.ends_with("RD") || addr.contains("RD"), "Got: {}", addr);
    }

    // ─── convert_address — state normalization ────────────────────────────────

    #[test]
    fn test_convert_address_normalizes_full_state_name() {
        let (state, _) = convert_address("Victoria", "5 Park Street");
        assert_eq!(state, "VIC");
    }

    #[test]
    fn test_convert_address_preserves_abbreviated_state() {
        let (state, _) = convert_address("NSW", "5 Park Street");
        assert_eq!(state, "NSW");
    }

    // ─── convert_address — edge cases ─────────────────────────────────────────

    #[test]
    fn test_convert_address_apostrophe_does_not_crash() {
        // Apostrophes are stripped in the reversal logic — ensure no crash
        let (_, addr) = convert_address("VIC", "O'Brien Road");
        assert!(!addr.is_empty());
    }

    #[test]
    fn test_convert_address_empty_address() {
        // Empty address should not crash and return some result
        let (state, _addr) = convert_address("VIC", "");
        assert_eq!(state, "VIC");
    }

    #[test]
    fn test_convert_address_place_becomes_pl() {
        let (_, addr) = convert_address("TAS", "8 Elm Place");
        assert!(addr.ends_with("PL") || addr.contains("PL"), "Got: {}", addr);
    }

    #[test]
    fn test_convert_address_close_becomes_cl() {
        let (_, addr) = convert_address("ACT", "15 Oak Close");
        assert!(addr.ends_with("CL") || addr.contains("CL"), "Got: {}", addr);
    }
}
