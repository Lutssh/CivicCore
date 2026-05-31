use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone, Copy)]
pub enum Sex {
    #[serde(rename = "M")]
    Male,
    #[serde(rename = "F")]
    Female,
}

impl Sex {
    pub fn as_char(&self) -> char {
        match self {
            Sex::Male => 'M',
            Sex::Female => 'F',
        }
    }

    pub fn from_char(c: char) -> Option<Self> {
        match c {
            'M' => Some(Sex::Male),
            'F' => Some(Sex::Female),
            _ => None,
        }
    }
}

const SAFE_SET: &[char] = &[
    '2', '3', '4', '5', '6', '7', '8', '9',
    'A', 'C', 'E', 'F', 'H', 'J', 'K', 'L', 'M', 'N', 'P', 'R', 'T', 'V', 'W', 'X', 'Y',
];

/// Generates a 12-character Citizen ID
pub fn generate_citizen_id(sex: Sex, year: u16, sequence: u32) -> String {
    let country = 'C';
    let sex_char = sex.as_char();
    let yy = format!("{:02}", year % 100);
    let seq = format!("{:04}", sequence % 10000);

    // Positions 9-10: Entropy based on sequence
    let entropy = compute_entropy(sequence);

    // Positions 1-10 form the base
    let base = format!("{}{}{}{}{}", country, sex_char, yy, seq, entropy);

    // Positions 11-12: Check value
    let check = compute_check(&base);

    format!("{}{}", base, check)
}

/// Validates a 12-character Citizen ID
pub fn validate_citizen_id(id: &str) -> bool {
    if id.len() != 12 {
        return false;
    }
    if !id.starts_with('C') {
        return false;
    }
    if !matches!(&id[1..2], "M" | "F") {
        return false;
    }

    // Check if all characters are valid (first 8 are alphanumeric, last 4 from SAFE_SET)
    // Actually, positions 9-12 MUST be from SAFE_SET.
    for c in id[8..12].chars() {
        if !SAFE_SET.contains(&c) {
            return false;
        }
    }

    let base = &id[0..10];
    let provided_check = &id[10..12];
    let expected_check = compute_check(base);

    provided_check == expected_check
}

/// Computes 2 entropy characters based on sequence
fn compute_entropy(sequence: u32) -> String {
    // Simple non-sequential mapping for entropy
    // We use a large prime to scramble the sequence
    let salt: u32 = 0x5A3B12; // arbitrary salt
    let scrambled = (sequence.wrapping_add(salt)).wrapping_mul(0x9E3779B9);
    
    let idx1 = (scrambled % (SAFE_SET.len() as u32)) as usize;
    let idx2 = ((scrambled / (SAFE_SET.len() as u32)) % (SAFE_SET.len() as u32)) as usize;
    
    format!("{}{}", SAFE_SET[idx1], SAFE_SET[idx2])
}

/// Computes 2 check characters using a Luhn-equivalent algorithm over a string
fn compute_check(base: &str) -> String {
    let mut sum1: u32 = 0;
    let mut sum2: u32 = 0;

    for (i, c) in base.chars().enumerate() {
        let val = char_to_val(c);
        if i % 2 == 0 {
            sum1 = (sum1 + val) % (SAFE_SET.len() as u32);
        } else {
            sum2 = (sum2 + val) % (SAFE_SET.len() as u32);
        }
    }

    // Final check characters
    format!("{}{}", SAFE_SET[sum1 as usize], SAFE_SET[sum2 as usize])
}

fn char_to_val(c: char) -> u32 {
    // Map char to a value for the checksum. 
    // If it's in SAFE_SET, use its index. Otherwise use its ASCII value.
    if let Some(pos) = SAFE_SET.iter().position(|&sc| sc == c) {
        pos as u32
    } else {
        c as u32 % (SAFE_SET.len() as u32)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_generation_and_validation() {
        let id = generate_citizen_id(Sex::Male, 2026, 1);
        assert_eq!(id.len(), 12);
        assert!(validate_citizen_id(&id));
        
        let id2 = generate_citizen_id(Sex::Female, 1985, 42);
        assert!(validate_citizen_id(&id2));
        assert_ne!(id, id2);
    }

    #[test]
    fn test_invalid_id() {
        assert!(!validate_citizen_id("CM260001XXXX")); // Wrong check
        assert!(!validate_citizen_id("XM260001AA")); // Wrong length and prefix
    }
}
