use aes_gcm::{
    aead::{Aead, KeyInit, OsRng},
    Aes256Gcm,
};
use aes_gcm::aead::rand_core::RngCore;
use base64::{engine::general_purpose::STANDARD, Engine as _};
use sha2::{Digest, Sha256};

/// Derives a 32-byte AES-256 key from an arbitrary-length env string using SHA-256.
fn derive_key(raw_key: &str) -> [u8; 32] {
    let mut hasher = Sha256::new();
    hasher.update(raw_key.as_bytes());
    hasher.finalize().into()
}

/// Encrypts a plaintext string using AES-256-GCM.
/// Returns a base64-encoded string containing the nonce prepended to the ciphertext.
pub fn encrypt(plaintext: &str) -> Result<String, String> {
    let key_str = std::env::var("ENCRYPTION_KEY").map_err(|_| "Missing ENCRYPTION_KEY".to_string())?;
    let key = derive_key(&key_str);
    let cipher = Aes256Gcm::new_from_slice(&key).map_err(|e| e.to_string())?;

    // Generate a random 12-byte nonce
    let mut nonce_bytes = [0u8; 12];
    OsRng.fill_bytes(&mut nonce_bytes);
    let nonce = aes_gcm::Nonce::from(nonce_bytes);

    let ciphertext = cipher
        .encrypt(&nonce, plaintext.as_bytes())
        .map_err(|e| e.to_string())?;

    // Prepend nonce to ciphertext, then base64 encode the whole thing
    let mut combined = nonce_bytes.to_vec();
    combined.extend_from_slice(&ciphertext);
    Ok(STANDARD.encode(combined))
}

/// Decrypts a base64-encoded AES-256-GCM ciphertext (with prepended nonce).
pub fn decrypt(encoded: &str) -> Result<String, String> {
    let key_str = std::env::var("ENCRYPTION_KEY").map_err(|_| "Missing ENCRYPTION_KEY".to_string())?;
    let key = derive_key(&key_str);
    let cipher = Aes256Gcm::new_from_slice(&key).map_err(|e| e.to_string())?;

    let combined = STANDARD.decode(encoded).map_err(|e| e.to_string())?;
    if combined.len() < 12 {
        return Err("Invalid ciphertext: too short".to_string());
    }
    let (nonce_bytes, ciphertext) = combined.split_at(12);
    let nonce_arr: [u8; 12] = nonce_bytes.try_into().map_err(|_| "Invalid nonce".to_string())?;
    let nonce = aes_gcm::Nonce::from(nonce_arr);

    let plaintext = cipher
        .decrypt(&nonce, ciphertext)
        .map_err(|e| e.to_string())?;

    String::from_utf8(plaintext).map_err(|e| e.to_string())
}

/// Generates a deterministic blind index for a searchable PII field.
/// Uses SHA-256 with the ENCRYPTION_KEY as a pepper to prevent rainbow table attacks.
pub fn blind_index(value: &str) -> String {
    let key_str = std::env::var("ENCRYPTION_KEY")
        .expect("ENCRYPTION_KEY must be set for blind_index");
    let mut hasher = Sha256::new();
    hasher.update(value.to_lowercase().trim().as_bytes());
    hasher.update(key_str.as_bytes()); // pepper
    STANDARD.encode(hasher.finalize())
}

/// Encrypts an optional field - returns None if input is None or empty.
pub fn encrypt_opt(value: Option<&str>) -> Result<Option<String>, String> {
    match value {
        Some(v) if !v.is_empty() => Ok(Some(encrypt(v)?)),
        _ => Ok(None),
    }
}

/// Decrypts an optional field - returns None if input is None.
pub fn decrypt_opt(value: Option<&str>) -> Result<Option<String>, String> {
    match value {
        Some(v) => Ok(Some(decrypt(v)?)),
        None => Ok(None),
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Mutex;

    /// Global mutex to serialize tests that mutate ENCRYPTION_KEY (parallel test runners
    /// share a process-global environment, so concurrent mutations race).
    static ENV_LOCK: Mutex<()> = Mutex::new(());

    /// Sets the ENCRYPTION_KEY env var for the duration of the closure, then restores the
    /// previous value. The global ENV_LOCK ensures only one such mutation is in-flight at
    /// any time, preventing races between parallel tests.
    fn with_key<T>(key: &str, f: impl FnOnce() -> T) -> T {
        let _guard = ENV_LOCK.lock().unwrap();
        let previous = std::env::var("ENCRYPTION_KEY").ok();
        unsafe { std::env::set_var("ENCRYPTION_KEY", key) };
        let result = f();
        match previous {
            Some(prev) => unsafe { std::env::set_var("ENCRYPTION_KEY", prev) },
            None => unsafe { std::env::remove_var("ENCRYPTION_KEY") },
        }
        result
    }

    // ── encrypt / decrypt ─────────────────────────────────────────────────────

    #[test]
    fn encrypt_decrypt_roundtrip() {
        with_key("test-secret-key", || {
            let plaintext = "Hello, PoliCRM!";
            let encrypted = encrypt(plaintext).expect("encrypt should succeed");
            let decrypted = decrypt(&encrypted).expect("decrypt should succeed");
            assert_eq!(decrypted, plaintext);
        });
    }

    #[test]
    fn encrypt_empty_string_roundtrip() {
        with_key("test-secret-key", || {
            let plaintext = "";
            let encrypted = encrypt(plaintext).expect("encrypt should succeed");
            let decrypted = decrypt(&encrypted).expect("decrypt should succeed");
            assert_eq!(decrypted, plaintext);
        });
    }

    #[test]
    fn encrypt_unicode_roundtrip() {
        with_key("test-secret-key", || {
            let plaintext = "Ångström Ödland — 日本語テスト 🇦🇺";
            let encrypted = encrypt(plaintext).expect("encrypt should succeed");
            let decrypted = decrypt(&encrypted).expect("decrypt should succeed");
            assert_eq!(decrypted, plaintext);
        });
    }

    #[test]
    fn encrypt_produces_base64_output() {
        with_key("test-secret-key", || {
            let encrypted = encrypt("test").expect("encrypt should succeed");
            // Should be valid base64 (no panics from decode)
            let decoded = base64::engine::general_purpose::STANDARD
                .decode(&encrypted)
                .expect("encrypted output should be valid base64");
            // AES-GCM nonce (12) + 4-byte plaintext + 16-byte tag = 32 bytes minimum
            assert!(decoded.len() >= 12 + 16, "decoded length should be at least 28 bytes");
        });
    }

    #[test]
    fn encrypt_same_plaintext_different_ciphertexts() {
        // Because a random nonce is used each time, two encryptions of the same value differ.
        with_key("test-secret-key", || {
            let plaintext = "same plaintext";
            let enc1 = encrypt(plaintext).expect("first encrypt should succeed");
            let enc2 = encrypt(plaintext).expect("second encrypt should succeed");
            // With overwhelming probability the nonces will differ.
            assert_ne!(enc1, enc2, "each encryption should produce a unique ciphertext");
        });
    }

    #[test]
    fn decrypt_fails_with_wrong_key() {
        let ciphertext = with_key("correct-key", || {
            encrypt("secret data").expect("encrypt should succeed")
        });
        // Decrypt with a different key should fail (AES-GCM tag verification).
        let result = with_key("wrong-key", || decrypt(&ciphertext));
        assert!(result.is_err(), "decryption with wrong key should fail");
    }

    #[test]
    fn decrypt_fails_on_truncated_ciphertext() {
        with_key("test-secret-key", || {
            // A base64 string that decodes to fewer than 12 bytes (empty byte slice).
            let too_short = base64::engine::general_purpose::STANDARD.encode(b"short");
            let result = decrypt(&too_short);
            assert!(result.is_err(), "decryption of too-short data should fail");
        });
    }

    #[test]
    fn decrypt_fails_on_invalid_base64() {
        with_key("test-secret-key", || {
            let result = decrypt("not!!valid==base64$$");
            assert!(result.is_err(), "decryption of invalid base64 should fail");
        });
    }

    #[test]
    fn decrypt_fails_on_corrupted_ciphertext() {
        with_key("test-secret-key", || {
            let mut encrypted = encrypt("some data").expect("encrypt should succeed");
            // Flip the last character to corrupt the GCM tag.
            let last = encrypted.pop().unwrap_or('A');
            let flipped = if last == 'A' { 'B' } else { 'A' };
            encrypted.push(flipped);
            let result = decrypt(&encrypted);
            assert!(result.is_err(), "decryption of corrupted ciphertext should fail");
        });
    }

    #[test]
    fn decrypt_fails_when_key_missing() {
        let _guard = ENV_LOCK.lock().unwrap();
        let previous = std::env::var("ENCRYPTION_KEY").ok();
        unsafe { std::env::remove_var("ENCRYPTION_KEY") };
        let result = decrypt("anyvalue");
        match previous {
            Some(prev) => unsafe { std::env::set_var("ENCRYPTION_KEY", prev) },
            None => {}
        }
        assert!(result.is_err(), "decrypt should fail when ENCRYPTION_KEY is not set");
    }

    #[test]
    fn encrypt_fails_when_key_missing() {
        let _guard = ENV_LOCK.lock().unwrap();
        let previous = std::env::var("ENCRYPTION_KEY").ok();
        unsafe { std::env::remove_var("ENCRYPTION_KEY") };
        let result = encrypt("any plaintext");
        match previous {
            Some(prev) => unsafe { std::env::set_var("ENCRYPTION_KEY", prev) },
            None => {}
        }
        assert!(result.is_err(), "encrypt should fail when ENCRYPTION_KEY is not set");
    }

    // ── blind_index ───────────────────────────────────────────────────────────

    #[test]
    fn blind_index_is_deterministic() {
        with_key("test-pepper", || {
            let h1 = blind_index("user@example.com");
            let h2 = blind_index("user@example.com");
            assert_eq!(h1, h2, "blind_index must return the same value for identical inputs");
        });
    }

    #[test]
    fn blind_index_case_insensitive() {
        with_key("test-pepper", || {
            let lower = blind_index("user@example.com");
            let upper = blind_index("USER@EXAMPLE.COM");
            let mixed = blind_index("User@Example.Com");
            assert_eq!(lower, upper, "blind_index should normalise case");
            assert_eq!(lower, mixed, "blind_index should normalise case");
        });
    }

    #[test]
    fn blind_index_trims_whitespace() {
        with_key("test-pepper", || {
            let clean = blind_index("user@example.com");
            let padded = blind_index("  user@example.com  ");
            assert_eq!(clean, padded, "blind_index should trim surrounding whitespace");
        });
    }

    #[test]
    fn blind_index_different_values_differ() {
        with_key("test-pepper", || {
            let h1 = blind_index("alice@example.com");
            let h2 = blind_index("bob@example.com");
            assert_ne!(h1, h2, "distinct inputs must produce distinct blind indices");
        });
    }

    #[test]
    fn blind_index_different_keys_differ() {
        let h1 = with_key("pepper-one", || blind_index("user@example.com"));
        let h2 = with_key("pepper-two", || blind_index("user@example.com"));
        assert_ne!(h1, h2, "a different key/pepper should produce a different index");
    }

    #[test]
    fn blind_index_returns_base64() {
        with_key("test-pepper", || {
            let index = blind_index("user@example.com");
            base64::engine::general_purpose::STANDARD
                .decode(&index)
                .expect("blind_index result should be valid base64");
        });
    }

    // ── encrypt_opt / decrypt_opt ─────────────────────────────────────────────

    #[test]
    fn encrypt_opt_none_returns_none() {
        with_key("test-secret-key", || {
            let result = encrypt_opt(None).expect("encrypt_opt(None) should not error");
            assert_eq!(result, None);
        });
    }

    #[test]
    fn encrypt_opt_empty_string_returns_none() {
        with_key("test-secret-key", || {
            let result = encrypt_opt(Some("")).expect("encrypt_opt(Some(\"\")) should not error");
            assert_eq!(result, None, "empty string should be treated as absent");
        });
    }

    #[test]
    fn encrypt_opt_some_value_returns_some() {
        with_key("test-secret-key", || {
            let result = encrypt_opt(Some("Alice")).expect("encrypt_opt should succeed");
            assert!(result.is_some(), "non-empty input should produce Some(ciphertext)");
        });
    }

    #[test]
    fn encrypt_opt_roundtrip_with_decrypt_opt() {
        with_key("test-secret-key", || {
            let original = "optionally-encrypted value";
            let encrypted = encrypt_opt(Some(original)).expect("encrypt_opt should succeed");
            let decrypted = decrypt_opt(encrypted.as_deref()).expect("decrypt_opt should succeed");
            assert_eq!(decrypted.as_deref(), Some(original));
        });
    }

    #[test]
    fn decrypt_opt_none_returns_none() {
        with_key("test-secret-key", || {
            let result = decrypt_opt(None).expect("decrypt_opt(None) should not error");
            assert_eq!(result, None);
        });
    }

    #[test]
    fn decrypt_opt_some_encrypted_roundtrips() {
        with_key("test-secret-key", || {
            let plaintext = "sensitive field";
            let encrypted = encrypt(plaintext).expect("encrypt should succeed");
            let result = decrypt_opt(Some(&encrypted)).expect("decrypt_opt should succeed");
            assert_eq!(result.as_deref(), Some(plaintext));
        });
    }

    // ── derive_key (tested indirectly via encrypt/decrypt) ────────────────────

    #[test]
    fn derive_key_produces_32_bytes() {
        // derive_key is private; verify indirectly: encryption only works if key is 32 bytes.
        with_key("any-length-key-whether-short-or-quite-long-indeed", || {
            let enc = encrypt("verify key derivation").expect("encrypt should succeed with any key length");
            let dec = decrypt(&enc).expect("decrypt should succeed");
            assert_eq!(dec, "verify key derivation");
        });
    }

    #[test]
    fn large_plaintext_roundtrip() {
        with_key("test-secret-key", || {
            let large: String = "A".repeat(10_000);
            let enc = encrypt(&large).expect("encrypt should handle large input");
            let dec = decrypt(&enc).expect("decrypt should handle large ciphertext");
            assert_eq!(dec, large);
        });
    }
}
