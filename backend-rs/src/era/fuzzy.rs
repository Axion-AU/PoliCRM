/// Fuzzy matching for ERA records.
///
/// Scoring mirrors the Python rapidfuzz implementation:
///   - `fuzz.ratio`         → `normalized_levenshtein` (0–1, scaled to 0–100)
///   - `fuzz.partial_ratio` → sliding-window best ratio over the longer string
///
/// Weights: name 70 %, address 30 %.
///   name_score   = surname * 60 % + given * 40 %
///   address_score = locality * 50 % + postcode_exact * 50 %
///   overall      = name * 70 % + address * 30 %
use strsim::normalized_levenshtein;

use super::parse::normalize_name;

// ─── Default threshold ────────────────────────────────────────────────────────

/// Minimum overall score (0–100) for a match to be accepted.
pub const MATCH_THRESHOLD: i64 = 80;

// ─── Core scoring ─────────────────────────────────────────────────────────────

/// `fuzz.ratio` equivalent: normalised Levenshtein distance → 0–100 integer.
#[inline]
fn ratio(a: &str, b: &str) -> i64 {
    (normalized_levenshtein(a, b) * 100.0).round() as i64
}

/// `fuzz.partial_ratio` equivalent.
///
/// Slides the shorter string over the longer string and returns the best
/// ratio found in any window.  This lets "Ethan" match "Ethan Christopher"
/// with a high score.
fn partial_ratio(shorter: &str, longer: &str) -> i64 {
    if shorter.is_empty() || longer.is_empty() {
        return 0;
    }

    let (s, l) = if shorter.len() <= longer.len() {
        (shorter, longer)
    } else {
        (longer, shorter)
    };

    // Operate on character boundaries.
    let s_chars: Vec<char> = s.chars().collect();
    let l_chars: Vec<char> = l.chars().collect();

    let window = s_chars.len();
    let range = l_chars.len().saturating_sub(window) + 1;

    let mut best: i64 = 0;
    for i in 0..range {
        let window_str: String = l_chars[i..i + window].iter().collect();
        let score = ratio(s, &window_str);
        if score > best {
            best = score;
        }
        // Short-circuit on perfect match
        if best == 100 {
            break;
        }
    }
    best
}

// ─── Public scoring functions ─────────────────────────────────────────────────

/// Score the name component of a match (0–100).
///
/// Returns `(name_score, surname_score, given_score)`.
pub fn name_score(
    member_surname: &str,
    member_given: &str,
    era_surname: &str,
    era_given: &str,
) -> (i64, i64, i64) {
    let ms = normalize_name(member_surname);
    let mg = normalize_name(member_given);
    let es = normalize_name(era_surname);
    let eg = normalize_name(era_given);

    let surname_sc = ratio(&ms, &es);
    let given_sc = partial_ratio(&mg, &eg);

    // Surname weighted 60 %, given names 40 %
    let name_sc = (surname_sc * 60 + given_sc * 40) / 100;
    (name_sc, surname_sc, given_sc)
}

/// Score the address component of a match (0–100).
pub fn address_score(
    member_locality: &str,
    member_postcode: &str,
    era_locality: &str,
    era_postcode: &str,
) -> i64 {
    let locality_sc = ratio(
        &normalize_name(member_locality),
        &normalize_name(era_locality),
    );
    let postcode_sc: i64 = if !member_postcode.is_empty()
        && member_postcode.trim() == era_postcode.trim()
    {
        100
    } else {
        0
    };

    // Locality 50 %, postcode 50 %
    (locality_sc * 50 + postcode_sc * 50) / 100
}

/// Composite match score between a CRM member and an ERA record.
///
/// Returns `(overall_score, name_score, address_score)` all in 0–100.
pub fn match_score(
    member_surname: &str,
    member_given: &str,
    member_locality: &str,
    member_postcode: &str,
    era_surname: &str,
    era_given: &str,
    era_locality: &str,
    era_postcode: &str,
) -> (i64, i64, i64) {
    let (name_sc, _, _) = name_score(member_surname, member_given, era_surname, era_given);
    let addr_sc = address_score(member_locality, member_postcode, era_locality, era_postcode);

    // Name 70 %, address 30 %
    let overall = (name_sc * 70 + addr_sc * 30) / 100;
    (overall, name_sc, addr_sc)
}

// ─── Unit tests ───────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_ratio_identical() {
        assert_eq!(ratio("smith", "smith"), 100);
    }

    #[test]
    fn test_ratio_different() {
        let r = ratio("smith", "smyth");
        assert!(r > 70 && r < 100, "got {r}");
    }

    #[test]
    fn test_partial_ratio_substring() {
        // "Ethan" should match well inside "Ethan Christopher"
        let score = partial_ratio("ethan", "ethan christopher");
        assert_eq!(score, 100);
    }

    #[test]
    fn test_partial_ratio_no_match() {
        let score = partial_ratio("smith", "jones");
        assert!(score < 60, "got {score}");
    }

    #[test]
    fn test_match_score_high() {
        let (overall, name_sc, addr_sc) = match_score(
            "Smith", "John", "Melbourne", "3000",
            "Smith", "John", "Melbourne", "3000",
        );
        assert_eq!(overall, 100);
        assert_eq!(name_sc, 100);
        assert_eq!(addr_sc, 100);
    }

    #[test]
    fn test_match_score_name_only() {
        // Matching name only, postcode differs
        let (overall, name_sc, _addr_sc) = match_score(
            "Smith", "John", "Melbourne", "3000",
            "Smith", "John", "Richmond", "3121",
        );
        assert_eq!(name_sc, 100);
        // address_score will be low (postcode mismatch, locality mismatch)
        assert!(overall < 100 && overall >= 70, "got {overall}");
    }

    #[test]
    fn test_address_score_postcode_match() {
        let sc = address_score("Brisbane", "4000", "Brisbane", "4000");
        assert_eq!(sc, 100);
    }

    #[test]
    fn test_address_score_postcode_mismatch() {
        let sc = address_score("Brisbane", "4000", "Brisbane", "4001");
        // locality matches but postcode doesn't
        assert!(sc >= 45 && sc <= 55, "got {sc}");
    }
}
