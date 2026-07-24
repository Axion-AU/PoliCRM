/// ERA .txt file parser.
///
/// AEC ERA files are tab-separated, with a one-row header, and exactly 41
/// columns (0-indexed) per the AEC data dictionary.
use super::models::EraRecordInsert;

// ─── Column index constants ────────────────────────────────────────────────────

const COL_ENROLMENT_STATE: usize = 0;
const COL_TRANSACTION_NUMBER: usize = 1;
const COL_FEDERAL_DIRECT_INDICATOR: usize = 2;
const COL_TITLE: usize = 3;
const COL_GIVEN_NAMES: usize = 4;
const COL_SURNAME: usize = 5;
const COL_DATE_OF_BIRTH: usize = 6;
const COL_GENDER: usize = 7;
const COL_HABITATION_NAME: usize = 8;
const COL_FLAT_NUMBER: usize = 9;
const COL_STREET_NUMBER: usize = 10;
const COL_STREET_NAME: usize = 11;
const COL_STREET_TYPE: usize = 12;
const COL_LOCALITY_NAME: usize = 13;
const COL_POST_CODE: usize = 14;
const COL_STATE: usize = 15;
const COL_FULL_ADDRESS: usize = 16;
const COL_ENROLLED_ADDRESS_DPID: usize = 17;
const COL_WALK_NUMBER: usize = 18;
const COL_ENROLLED_DATE: usize = 19;
const COL_ELIGIBILITY_FLAG: usize = 20;
const COL_GPV_INDICATOR: usize = 21;
const COL_NEW_ENROLMENT_FLAG: usize = 22;
const COL_POSTAL_ADDRESS: usize = 23;
const COL_POSTAL_ADDRESS_DPID: usize = 24;
const COL_FEDERAL_DIVISION: usize = 25;
const COL_FEDERAL_DIVISION_PRE_REDIS: usize = 26;
const COL_STATE_DISTRICT: usize = 27;
const COL_STATE_DISTRICT_PRE_REDIS: usize = 28;
const COL_LOCAL_GOVERNMENT_AREA: usize = 29;
const COL_LGA_PRE_REDIS: usize = 30;
const COL_SA1: usize = 31;
const COL_MAILING_NAME: usize = 32;
const COL_MAILING_LINE1: usize = 33;
const COL_MAILING_LINE2: usize = 34;
const COL_MAILING_LINE3: usize = 35;
const COL_MAILING_LINE4: usize = 36;
const COL_PREV_ENROLMENT_STATE: usize = 37;
const COL_PREV_TRANSACTION_NUMBER: usize = 38;
const COL_DUAL_ENROLMENT_STATE: usize = 39;
const COL_DUAL_TRANSACTION_NUMBER: usize = 40;

const EXPECTED_COLS: usize = 41;

// ─── Normalisation helpers ─────────────────────────────────────────────────────

/// Normalise a name for fuzzy matching: lowercase, trim whitespace.
pub fn normalize_name(s: &str) -> String {
    s.trim().to_lowercase()
}

/// Normalise an address for fuzzy matching: lowercase, trim, expand common
/// street-type abbreviations to their short forms.
pub fn normalize_address(s: &str) -> String {
    let mut addr = s.trim().to_lowercase();

    // These replacements mirror the Python `normalize_address` function.
    // Order matters: longer strings first to avoid partial replacement.
    const REPLACEMENTS: &[(&str, &str)] = &[
        (" boulevard", " blvd"),
        (" crescent", " cres"),
        (" highway", " hwy"),
        (" parade", " pde"),
        (" avenue", " ave"),
        (" street", " st"),
        (" place", " pl"),
        (" court", " ct"),
        (" drive", " dr"),
        (" road", " rd"),
    ];

    for (long, short) in REPLACEMENTS {
        if addr.contains(long) {
            addr = addr.replace(long, short);
        }
    }

    addr
}

// ─── Row parser ───────────────────────────────────────────────────────────────

/// Extract a column value: trim whitespace, return `None` if empty.
#[inline]
fn col(cols: &[&str], idx: usize) -> Option<String> {
    let s = cols.get(idx).copied().unwrap_or("").trim();
    if s.is_empty() { None } else { Some(s.to_string()) }
}

/// Parse a single tab-separated ERA row into an `EraRecordInsert`.
///
/// Returns `None` when the row is entirely empty or cannot be mapped (e.g.
/// trailing newline at EOF).
pub fn parse_era_row(line: &str, upload_id: i64) -> Option<EraRecordInsert> {
    // Split on tab; collect into a Vec so we can index safely
    let raw: Vec<&str> = line.split('\t').collect();

    // Bail on completely empty lines (e.g. trailing newline at EOF)
    if raw.iter().all(|s| s.trim().is_empty()) {
        return None;
    }

    let surname = col(&raw, COL_SURNAME);
    let given_names = col(&raw, COL_GIVEN_NAMES);

    let surname_normalized = normalize_name(surname.as_deref().unwrap_or(""));
    let given_names_normalized = normalize_name(given_names.as_deref().unwrap_or(""));

    Some(EraRecordInsert {
        upload_id,
        enrolment_state: col(&raw, COL_ENROLMENT_STATE),
        transaction_number: col(&raw, COL_TRANSACTION_NUMBER),
        federal_direct_indicator: col(&raw, COL_FEDERAL_DIRECT_INDICATOR),
        title: col(&raw, COL_TITLE),
        given_names,
        surname,
        surname_normalized,
        given_names_normalized,
        date_of_birth: col(&raw, COL_DATE_OF_BIRTH),
        gender: col(&raw, COL_GENDER),
        habitation_name: col(&raw, COL_HABITATION_NAME),
        flat_number: col(&raw, COL_FLAT_NUMBER),
        street_number: col(&raw, COL_STREET_NUMBER),
        street_name: col(&raw, COL_STREET_NAME),
        street_type: col(&raw, COL_STREET_TYPE),
        locality_name: col(&raw, COL_LOCALITY_NAME),
        post_code: col(&raw, COL_POST_CODE),
        state: col(&raw, COL_STATE),
        full_address: col(&raw, COL_FULL_ADDRESS),
        enrolled_address_dpid: col(&raw, COL_ENROLLED_ADDRESS_DPID),
        walk_number: col(&raw, COL_WALK_NUMBER),
        enrolled_date: col(&raw, COL_ENROLLED_DATE),
        eligibility_flag: col(&raw, COL_ELIGIBILITY_FLAG),
        gpv_indicator: col(&raw, COL_GPV_INDICATOR),
        new_enrolment_flag: col(&raw, COL_NEW_ENROLMENT_FLAG),
        postal_address: col(&raw, COL_POSTAL_ADDRESS),
        postal_address_dpid: col(&raw, COL_POSTAL_ADDRESS_DPID),
        federal_division: col(&raw, COL_FEDERAL_DIVISION),
        federal_division_pre_redistribution: col(&raw, COL_FEDERAL_DIVISION_PRE_REDIS),
        state_district: col(&raw, COL_STATE_DISTRICT),
        state_district_pre_redistribution: col(&raw, COL_STATE_DISTRICT_PRE_REDIS),
        local_government_area: col(&raw, COL_LOCAL_GOVERNMENT_AREA),
        lga_pre_redistribution: col(&raw, COL_LGA_PRE_REDIS),
        sa1: col(&raw, COL_SA1),
        mailing_name: col(&raw, COL_MAILING_NAME),
        mailing_address_line1: col(&raw, COL_MAILING_LINE1),
        mailing_address_line2: col(&raw, COL_MAILING_LINE2),
        mailing_address_line3: col(&raw, COL_MAILING_LINE3),
        mailing_address_line4: col(&raw, COL_MAILING_LINE4),
        prev_enrolment_state: col(&raw, COL_PREV_ENROLMENT_STATE),
        prev_transaction_number: col(&raw, COL_PREV_TRANSACTION_NUMBER),
        dual_enrolment_state: col(&raw, COL_DUAL_ENROLMENT_STATE),
        dual_transaction_number: col(&raw, COL_DUAL_TRANSACTION_NUMBER),
    })
}

// ─── Unit tests ───────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    fn sample_row() -> String {
        // 41 tab-separated fields
        let mut fields: Vec<&str> = vec![""; EXPECTED_COLS];
        fields[COL_ENROLMENT_STATE] = "V";
        fields[COL_TRANSACTION_NUMBER] = "12345678";
        fields[COL_GIVEN_NAMES] = "John";
        fields[COL_SURNAME] = "Smith";
        fields[COL_POST_CODE] = "3000";
        fields[COL_LOCALITY_NAME] = "MELBOURNE";
        fields[COL_FULL_ADDRESS] = "1 Bourke St Melbourne VIC 3000";
        fields[COL_FEDERAL_DIVISION] = "Melbourne";
        fields.join("\t")
    }

    #[test]
    fn test_parse_era_row_basic() {
        let line = sample_row();
        let rec = parse_era_row(&line, 1).expect("should parse");
        assert_eq!(rec.surname.as_deref(), Some("Smith"));
        assert_eq!(rec.given_names.as_deref(), Some("John"));
        assert_eq!(rec.surname_normalized, "smith");
        assert_eq!(rec.given_names_normalized, "john");
        assert_eq!(rec.post_code.as_deref(), Some("3000"));
        assert_eq!(rec.federal_division.as_deref(), Some("Melbourne"));
        assert_eq!(rec.upload_id, 1);
    }

    #[test]
    fn test_parse_era_row_empty_line() {
        assert!(parse_era_row("", 1).is_none());
        assert!(parse_era_row("\t\t\t", 1).is_none());
    }

    #[test]
    fn test_normalize_name() {
        assert_eq!(normalize_name("  SMITH  "), "smith");
        assert_eq!(normalize_name("O'Brien"), "o'brien");
    }

    #[test]
    fn test_normalize_address() {
        assert_eq!(normalize_address("1 MAIN STREET"), "1 main st");
        assert_eq!(normalize_address("2 Oak Avenue"), "2 oak ave");
        assert_eq!(normalize_address("4 Pine Boulevard"), "4 pine blvd");
    }
}
