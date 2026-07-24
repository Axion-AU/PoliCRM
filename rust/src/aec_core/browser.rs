use std::collections::HashMap;
use std::time::Duration;

use rand::Rng;
use regex::Regex;
use thirtyfour::components::SelectElement;
use thirtyfour::prelude::*;
use tracing::{error, info, warn};

use crate::aec_core::models::{AecStatus};
use crate::aec_core::utils::{get_address_components, get_given_names, validate_membership_data};

// Form element IDs on the AEC website
pub const GIVEN_NAME_ID: &str = "textGivenName";
pub const SURNAME_ID: &str = "textSurname";
pub const POSTCODE_ID: &str = "textPostCode";
pub const SUBURB_ID: &str = "DropdownSuburb";
pub const STREET_ID: &str = "textStreetName";
pub const VERIFY_BUTTON_ID: &str = "buttonVerify";

pub const MAX_RETRIES: u32 = 3;
pub const RATE_LIMIT_DELAY: (f64, f64) = (12.0, 20.0);
pub const REQUEST_TIMEOUT: u64 = 20;

const BASE_RETRY_DELAY_SECS: u64 = 3;

const USER_AGENTS: &[&str] = &[
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:109.0) Gecko/20100101 Firefox/115.0",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/115.0",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36 Edg/119.0.0.0",
];

/// Create a Firefox WebDriver with anti-bot detection settings.
/// Assumes geckodriver is running at http://localhost:4444.
pub async fn get_driver(headless: bool) -> Result<WebDriver, anyhow::Error> {
    // Use rand values before any await points to avoid holding non-Send ThreadRng across awaits
    let (user_agent, width, height) = {
        let mut rng = rand::thread_rng();
        let ua = USER_AGENTS[rng.gen_range(0..USER_AGENTS.len())];
        let w: u32 = rng.gen_range(1024..=1920);
        let h: u32 = rng.gen_range(768..=1080);
        (ua, w, h)
    };

    let mut caps = DesiredCapabilities::firefox();

    // Private browsing
    caps.add_firefox_arg("-private")?;

    if headless {
        caps.add_firefox_arg("--headless")?;
    }

    // Disable webdriver flag detection
    caps.add_firefox_option("prefs", serde_json::json!({
        "dom.webdriver.enabled": false,
        "useAutomationExtension": false,
        "marionette.enabled": true,
        "privacy.trackingprotection.enabled": false,
        "dom.webnotifications.enabled": false,
        "general.useragent.override": user_agent,
        "media.peerconnection.enabled": false,
        "geo.enabled": false,
    }))?;

    let driver = WebDriver::new("http://localhost:4444", caps).await?;

    // Set page load timeout
    driver
        .set_page_load_timeout(Duration::from_secs(30))
        .await?;
    driver
        .set_implicit_wait_timeout(Duration::from_secs(REQUEST_TIMEOUT))
        .await?;

    // Hide webdriver property via JS
    driver
        .execute(
            "Object.defineProperty(navigator, 'webdriver', {get: () => undefined})",
            vec![],
        )
        .await?;

    // Randomize window size
    driver
        .set_window_rect(0, 0, width, height)
        .await?;

    Ok(driver)
}

/// Extract electoral division information from AEC results page HTML.
/// Returns (federal_division, state_district, local_gov, local_ward).
pub fn extract_electoral_info(page_source: &str) -> (String, String, String, String) {
    let mut federal_division = String::new();
    let mut state_district = String::new();
    let mut local_gov = String::new();
    let mut local_ward = String::new();

    // Federal Division — may be a link or plain text after the label cell
    if let Ok(re) = Regex::new(
        r"(?i)Federal Division:?</.*?>\s*</td>\s*<td>\s*(?:<a[^>]*>)?([A-Z\s]+?)(?:</a>)?\s*</td>",
    ) {
        if let Some(cap) = re.captures(page_source) {
            federal_division = cap[1].trim().to_string();
        }
    }

    // State District
    if let Ok(re) = Regex::new(
        r"(?i)State District:?</.*?>\s*</td>\s*<td>\s*<label[^>]*>([A-Z\s]+?)</label>",
    ) {
        if let Some(cap) = re.captures(page_source) {
            state_district = cap[1].trim().to_string();
        }
    }

    // Local Government Area
    if let Ok(re) = Regex::new(
        r"(?i)Local Government Area:?</.*?>\s*</td>\s*<td>\s*<label[^>]*>([A-Z\s]+?)</label>",
    ) {
        if let Some(cap) = re.captures(page_source) {
            local_gov = cap[1].trim().to_string();
        }
    }

    // Local Ward
    if let Ok(re) = Regex::new(
        r"(?i)Local Ward:?</.*?>\s*</td>\s*<td>\s*<label[^>]*>([A-Z\s]+?)</label>",
    ) {
        if let Some(cap) = re.captures(page_source) {
            local_ward = cap[1].trim().to_string();
        }
    }

    (federal_division, state_district, local_gov, local_ward)
}

/// Type text into an element with human-like per-character delays.
pub async fn human_type(element: &WebElement, text: &str) -> Result<(), WebDriverError> {
    element.clear().await?;

    // Compute per-character delays before any await (ThreadRng is !Send)
    let delays: Vec<u64> = {
        let mut rng = rand::thread_rng();
        let total_ms: f64 = if text.is_empty() {
            0.0
        } else {
            rng.gen_range(300.0..800.0)
        };
        let delay_per_char = if text.is_empty() { 0.0 } else { total_ms / text.len() as f64 };
        text.chars()
            .map(|_| {
                let jitter: f64 = rng.gen_range(0.5..1.5);
                (delay_per_char * jitter) as u64
            })
            .collect()
    };

    for (ch, delay_ms) in text.chars().zip(delays.into_iter()) {
        element.send_keys(ch.to_string()).await?;
        tokio::time::sleep(Duration::from_millis(delay_ms)).await;
    }
    Ok(())
}

/// Sleep for a random duration between two bounds (in seconds).
async fn random_sleep(min_secs: f64, max_secs: f64) {
    // Compute the delay before awaiting so ThreadRng is not held across the await point
    let ms = {
        let mut rng = rand::thread_rng();
        rng.gen_range((min_secs * 1000.0) as u64..=(max_secs * 1000.0) as u64)
    };
    tokio::time::sleep(Duration::from_millis(ms)).await;
}

/// Check AEC enrollment status for a single member row.
/// Implements full form automation with retry/backoff logic.
pub async fn get_aec_status(
    driver: &WebDriver,
    row: &HashMap<String, Option<String>>,
    max_retries: u32,
) -> AecStatus {
    let given_names = get_given_names(row);
    let last_name = row
        .get("last_name")
        .and_then(|v| v.as_deref())
        .unwrap_or("")
        .to_string();

    // Validate input data first
    if let Err(e) = validate_membership_data(row) {
        warn!("{} {} — validation failed: {}", given_names, last_name, e);
        return AecStatus::failed();
    }

    let (street_opt, suburb_opt, state_opt, postcode_opt) = get_address_components(row);

    let street = match street_opt {
        Some(s) => s,
        None => {
            warn!("{} {} — missing street", given_names, last_name);
            return AecStatus::failed();
        }
    };
    let suburb = match suburb_opt {
        Some(s) => s,
        None => {
            warn!("{} {} — missing suburb", given_names, last_name);
            return AecStatus::failed();
        }
    };
    let state = match state_opt {
        Some(s) => s,
        None => {
            warn!("{} {} — missing state", given_names, last_name);
            return AecStatus::failed();
        }
    };
    let postcode = match postcode_opt {
        Some(p) => p,
        None => {
            warn!("{} {} — missing postcode", given_names, last_name);
            return AecStatus::failed();
        }
    };

    info!(
        "Checking {} {} ({})",
        given_names,
        last_name,
        row.get("nationbuilder_id")
            .and_then(|v| v.as_deref())
            .unwrap_or("?")
    );

    // Rate-limiting delay before each check
    random_sleep(RATE_LIMIT_DELAY.0, RATE_LIMIT_DELAY.1).await;

    for attempt in 0..max_retries {
        match attempt_aec_check(
            driver,
            &given_names,
            &last_name,
            &postcode,
            &suburb,
            &state,
            &street,
        )
        .await
        {
            Ok(status) => {
                info!("✓ {} {} → {}", given_names, last_name, status.result);
                return status;
            }
            Err(CheckError::Captcha) => {
                error!("CAPTCHA detected for {} {}", given_names, last_name);
                if attempt < max_retries - 1 {
                    let delay = BASE_RETRY_DELAY_SECS * 2u64.pow(attempt);
                    info!(
                        "Waiting {}s before retry (attempt {}/{})",
                        delay,
                        attempt + 2,
                        max_retries
                    );
                    tokio::time::sleep(Duration::from_secs(delay)).await;
                    let _ = driver.goto("https://check.aec.gov.au/").await;
                    continue;
                }
                return AecStatus::captcha();
            }
            Err(CheckError::SuburbNotFound) => {
                warn!("Suburb '{}' not found for {} {}", suburb, given_names, last_name);
                if attempt < max_retries - 1 {
                    let delay = BASE_RETRY_DELAY_SECS * (attempt as u64 + 1);
                    tokio::time::sleep(Duration::from_secs(delay)).await;
                    let _ = driver.goto("https://check.aec.gov.au/").await;
                    continue;
                }
                return AecStatus {
                    result: crate::aec_core::models::AecResult::FailSuburb,
                    federal: None,
                    state: None,
                    local_gov: None,
                    local_ward: None,
                };
            }
            Err(CheckError::StreetNotFound) => {
                warn!("Street '{}' not found for {} {}", street, given_names, last_name);
                if attempt < max_retries - 1 {
                    let delay = BASE_RETRY_DELAY_SECS * (attempt as u64 + 1);
                    tokio::time::sleep(Duration::from_secs(delay)).await;
                    let _ = driver.goto("https://check.aec.gov.au/").await;
                    continue;
                }
                return AecStatus {
                    result: crate::aec_core::models::AecResult::FailStreet,
                    federal: None,
                    state: None,
                    local_gov: None,
                    local_ward: None,
                };
            }
            Err(CheckError::Driver(e)) => {
                error!("WebDriver error for {} {}: {}", given_names, last_name, e);
                if attempt < max_retries - 1 {
                    let delay = BASE_RETRY_DELAY_SECS * (attempt as u64 + 1);
                    tokio::time::sleep(Duration::from_secs(delay)).await;
                    let _ = driver.goto("https://check.aec.gov.au/").await;
                    continue;
                }
                return AecStatus::failed();
            }
            Err(CheckError::UnknownResult) => {
                warn!("Unknown result for {} {}", given_names, last_name);
                if attempt < max_retries - 1 {
                    let delay = BASE_RETRY_DELAY_SECS * (attempt as u64 + 1);
                    tokio::time::sleep(Duration::from_secs(delay)).await;
                    let _ = driver.goto("https://check.aec.gov.au/").await;
                    continue;
                }
                return AecStatus::failed();
            }
        }
    }

    AecStatus::failed()
}

#[derive(Debug)]
enum CheckError {
    Captcha,
    SuburbNotFound,
    StreetNotFound,
    Driver(WebDriverError),
    UnknownResult,
}

impl From<WebDriverError> for CheckError {
    fn from(e: WebDriverError) -> Self {
        CheckError::Driver(e)
    }
}

/// Single attempt at filling and submitting the AEC verification form.
async fn attempt_aec_check(
    driver: &WebDriver,
    given_names: &str,
    last_name: &str,
    postcode: &str,
    suburb: &str,
    state: &str,
    street: &str,
) -> Result<AecStatus, CheckError> {
    // Navigate to form
    driver
        .goto("https://check.aec.gov.au/")
        .await
        .map_err(CheckError::Driver)?;

    // Wait for page to load
    random_sleep(1.0, 2.0).await;

    // Fill given names
    let given_name_field = driver
        .find(By::Id(GIVEN_NAME_ID))
        .await
        .map_err(CheckError::Driver)?;
    human_type(&given_name_field, given_names)
        .await
        .map_err(CheckError::Driver)?;
    random_sleep(0.5, 1.0).await;

    // Fill surname
    let surname_field = driver
        .find(By::Id(SURNAME_ID))
        .await
        .map_err(CheckError::Driver)?;
    human_type(&surname_field, last_name)
        .await
        .map_err(CheckError::Driver)?;
    random_sleep(0.5, 1.0).await;

    // Fill postcode
    let postcode_field = driver
        .find(By::Id(POSTCODE_ID))
        .await
        .map_err(CheckError::Driver)?;
    human_type(&postcode_field, postcode)
        .await
        .map_err(CheckError::Driver)?;

    // Wait for suburb dropdown to populate (triggered by postcode)
    tokio::time::sleep(Duration::from_millis(2000)).await;

    // Select suburb from dropdown
    let suburb_state = format!("{} ({})", suburb.to_uppercase(), state.to_uppercase());
    let suburb_dropdown = driver
        .find(By::Id(SUBURB_ID))
        .await
        .map_err(CheckError::Driver)?;

    let select: SelectElement = SelectElement::new(&suburb_dropdown)
        .await
        .map_err(CheckError::Driver)?;

    // Try to select by value first, then by visible text scan
    let mut found_suburb = false;
    if select.select_by_value(&suburb_state).await.is_ok() {
        found_suburb = true;
    } else {
        // Scan options for a match
        let options: Vec<WebElement> = select.options().await.map_err(CheckError::Driver)?;
        for option in &options {
            let text = option.text().await.unwrap_or_default().to_uppercase();
            if text.contains(&suburb_state) {
                option.click().await.map_err(CheckError::Driver)?;
                found_suburb = true;
                break;
            }
        }
    }

    if !found_suburb {
        return Err(CheckError::SuburbNotFound);
    }

    random_sleep(0.5, 1.0).await;

    // Wait for street dropdown to populate (triggered by suburb selection)
    tokio::time::sleep(Duration::from_millis(2000)).await;

    // Select street using Select2 widget
    let selection_selector = format!("span[aria-labelledby='select2-{}-container']", STREET_ID);
    let results_id = format!("select2-{}-results", STREET_ID);

    // Click the Select2 container span
    let container_span = driver
        .find(By::Css(&selection_selector))
        .await
        .map_err(|_| CheckError::StreetNotFound)?;

    driver
        .execute(
            "arguments[0].scrollIntoView({block: 'center'});",
            vec![container_span.to_json().map_err(CheckError::Driver)?],
        )
        .await
        .map_err(CheckError::Driver)?;

    random_sleep(0.5, 1.0).await;
    container_span.click().await.map_err(CheckError::Driver)?;

    // Wait for Select2 search field to appear
    let search_box = tokio::time::timeout(
        Duration::from_secs(REQUEST_TIMEOUT),
        async {
            loop {
                if let Ok(el) = driver.find(By::ClassName("select2-search__field")).await {
                    if el.is_displayed().await.unwrap_or(false) {
                        return Ok::<WebElement, WebDriverError>(el);
                    }
                }
                tokio::time::sleep(Duration::from_millis(200)).await;
            }
        },
    )
    .await
    .map_err(|_| CheckError::StreetNotFound)?
    .map_err(CheckError::Driver)?;

    human_type(&search_box, street)
        .await
        .map_err(CheckError::Driver)?;

    // Wait for results list
    let results_appeared = tokio::time::timeout(Duration::from_secs(REQUEST_TIMEOUT), async {
        loop {
            if driver.find(By::Id(&results_id)).await.is_ok() {
                return true;
            }
            tokio::time::sleep(Duration::from_millis(200)).await;
        }
    })
    .await;

    if results_appeared.is_err() {
        return Err(CheckError::StreetNotFound);
    }

    random_sleep(0.3, 0.7).await;

    // Click the highlighted option
    let highlighted = tokio::time::timeout(
        Duration::from_secs(REQUEST_TIMEOUT),
        async {
            loop {
                if let Ok(el) = driver
                    .find(By::Css(".select2-results__option--highlighted"))
                    .await
                {
                    return Ok::<WebElement, WebDriverError>(el);
                }
                tokio::time::sleep(Duration::from_millis(200)).await;
            }
        },
    )
    .await
    .map_err(|_| CheckError::StreetNotFound)?
    .map_err(CheckError::Driver)?;

    highlighted.click().await.map_err(CheckError::Driver)?;

    // Wait for Select2 dropdown to close
    let _ = tokio::time::timeout(Duration::from_secs(REQUEST_TIMEOUT), async {
        loop {
            if driver.find(By::Id(&results_id)).await.is_err() {
                return;
            }
            tokio::time::sleep(Duration::from_millis(200)).await;
        }
    })
    .await;

    // Human-like pause before clicking Verify
    random_sleep(1.0, 2.0).await;

    // Click verify button
    let verify_btn = driver
        .find(By::Id(VERIFY_BUTTON_ID))
        .await
        .map_err(CheckError::Driver)?;

    driver
        .execute(
            "arguments[0].scrollIntoView({block: 'center'});",
            vec![verify_btn.to_json().map_err(CheckError::Driver)?],
        )
        .await
        .map_err(CheckError::Driver)?;

    random_sleep(0.5, 1.0).await;
    verify_btn.click().await.map_err(CheckError::Driver)?;

    // Wait for result page to load
    random_sleep(3.0, 4.0).await;

    let page_source = driver.source().await.map_err(CheckError::Driver)?;
    let page_lower = page_source.to_lowercase();

    if page_source.contains("Federal Division") || page_lower.contains("federal division") {
        let (fed, state_div, lg, ward) = extract_electoral_info(&page_source);
        let _ = driver.goto("https://check.aec.gov.au/").await;
        return Ok(AecStatus::pass(
            non_empty(fed),
            non_empty(state_div),
            non_empty(lg),
            non_empty(ward),
        ));
    }

    if page_lower.contains("partial") {
        let _ = driver.goto("https://check.aec.gov.au/").await;
        return Ok(AecStatus::partial(None, None, None, None));
    }

    if page_source.contains("Your current electoral enrolment could not be confirmed") {
        let _ = driver.goto("https://check.aec.gov.au/").await;
        return Ok(AecStatus::no_match());
    }

    if page_lower.contains("captcha") || page_lower.contains("verify you are human") {
        return Err(CheckError::Captcha);
    }

    // Unknown result — reset and let caller retry
    let _ = driver.goto("https://check.aec.gov.au/").await;
    Err(CheckError::UnknownResult)
}

fn non_empty(s: String) -> Option<String> {
    if s.is_empty() {
        None
    } else {
        Some(s)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    // ─── extract_electoral_info ──────────────────────────────────────────────

    /// Build a mock AEC results page with the provided division values.
    fn make_aec_results_page(
        federal: &str,
        state_district: &str,
        local_gov: &str,
        local_ward: &str,
    ) -> String {
        format!(
            r#"<html><body>
            <table>
              <tr>
                <td><strong>Federal Division:</strong></td>
                <td><a href="/fed">{federal}</a></td>
              </tr>
              <tr>
                <td><strong>State District:</strong></td>
                <td><label>{state_district}</label></td>
              </tr>
              <tr>
                <td><strong>Local Government Area:</strong></td>
                <td><label>{local_gov}</label></td>
              </tr>
              <tr>
                <td><strong>Local Ward:</strong></td>
                <td><label>{local_ward}</label></td>
              </tr>
            </table>
            </body></html>"#,
        )
    }

    #[test]
    fn test_extract_electoral_info_all_fields() {
        let html = make_aec_results_page("KOOYONG", "HAWTHORN", "BOROONDARA", "CAMBERWELL NORTH");
        let (fed, state, lg, ward) = extract_electoral_info(&html);
        assert_eq!(fed, "KOOYONG");
        assert_eq!(state, "HAWTHORN");
        assert_eq!(lg, "BOROONDARA");
        assert_eq!(ward, "CAMBERWELL NORTH");
    }

    #[test]
    fn test_extract_electoral_info_empty_page() {
        let html = "<html><body></body></html>";
        let (fed, state, lg, ward) = extract_electoral_info(html);
        assert_eq!(fed, "");
        assert_eq!(state, "");
        assert_eq!(lg, "");
        assert_eq!(ward, "");
    }

    #[test]
    fn test_extract_electoral_info_different_values() {
        let html = make_aec_results_page("SYDNEY", "SYDNEY", "CITY OF SYDNEY", "WARD A");
        let (fed, state, _lg, _ward) = extract_electoral_info(&html);
        assert_eq!(fed, "SYDNEY");
        assert_eq!(state, "SYDNEY");
    }

    #[test]
    fn test_extract_electoral_info_case_insensitive_labels() {
        // Regex is case-insensitive — lowercase "federal division:" still matches
        let html = r#"<html><body>
            <table>
              <tr>
                <td><strong>federal division:</strong></td>
                <td><a href="/fed">GRIFFITH</a></td>
              </tr>
            </table>
            </body></html>"#;
        let (fed, state, lg, ward) = extract_electoral_info(html);
        assert_eq!(fed, "GRIFFITH");
        assert!(state.is_empty());
        assert!(lg.is_empty());
        assert!(ward.is_empty());
    }

    #[test]
    fn test_extract_electoral_info_partial_page_only_federal() {
        let html = r#"<html><body>
            <table>
              <tr>
                <td><strong>Federal Division:</strong></td>
                <td><a href="/fed">BASS</a></td>
              </tr>
            </table>
            </body></html>"#;
        let (fed, state, lg, ward) = extract_electoral_info(html);
        assert_eq!(fed, "BASS");
        assert!(state.is_empty());
        assert!(lg.is_empty());
        assert!(ward.is_empty());
    }

    // ─── constants ───────────────────────────────────────────────────────────

    #[test]
    fn test_form_element_id_constants() {
        assert_eq!(GIVEN_NAME_ID, "textGivenName");
        assert_eq!(SURNAME_ID, "textSurname");
        assert_eq!(POSTCODE_ID, "textPostCode");
        assert_eq!(SUBURB_ID, "DropdownSuburb");
        assert_eq!(STREET_ID, "textStreetName");
        assert_eq!(VERIFY_BUTTON_ID, "buttonVerify");
    }

    #[test]
    fn test_rate_limit_delay_valid_range() {
        let (min, max) = RATE_LIMIT_DELAY;
        assert!(min > 0.0);
        assert!(max > min);
    }

    #[test]
    fn test_max_retries_positive() {
        assert!(MAX_RETRIES > 0);
    }
}
