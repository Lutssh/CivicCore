use serde::{Deserialize, Serialize};
use crate::crypto::encrypt::{encrypt_for_sector, decrypt_from_sector, sign_message, verify_signature};
use crate::crypto::keys::{load_private_key, load_public_key};
use uuid::Uuid;
use chrono::Utc;
use base64::{Engine as _, engine::general_purpose::STANDARD as BASE64};

#[derive(Serialize, Deserialize, Debug)]
pub struct InterSectorRequest {
    #[serde(rename = "i")]
    pub request_id: Uuid,
    #[serde(rename = "c")]
    pub citizen_id: String,
    #[serde(rename = "t")]
    pub query_type: String,
    #[serde(rename = "a")]
    pub requesting_authority: String,
    #[serde(rename = "o")]
    pub requesting_officer: Uuid,
    #[serde(rename = "s")]
    pub timestamp: chrono::DateTime<Utc>,
    #[serde(rename = "p")]
    pub purpose: String,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct InterSectorResponse {
    #[serde(rename = "i")]
    pub request_id: Uuid,
    #[serde(rename = "c")]
    pub citizen_id: String,
    #[serde(rename = "t")]
    pub query_type: String,
    #[serde(rename = "s")]
    pub responding_sector: String,
    #[serde(rename = "l")]
    pub clearance: String,
    #[serde(rename = "f")]
    pub flags: Vec<String>,
    #[serde(rename = "d")]
    pub timestamp: chrono::DateTime<Utc>,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct EncryptedEnvelope {
    pub payload: String,   // Base64 encrypted JSON
    pub signature: String, // Base64 signature
}

pub async fn send_query(
    sector_name: &str,
    target_url: &str,
    request: InterSectorRequest,
) -> Result<InterSectorResponse, Box<dyn std::error::Error + Send + Sync>> {
    // 1. Serialize request
    let plaintext = serde_json::to_vec(&request)?;

    // 2. Sign with CivicCore private key
    let our_private_key = load_private_key("civiccore")?;
    let signature = sign_message(&plaintext, &our_private_key)?;

    // 3. Encrypt with sector public key
    let sector_public_key = load_public_key(sector_name)?;
    let encrypted_payload = encrypt_for_sector(&plaintext, &sector_public_key)?;

    // 4. Wrap in envelope
    let envelope = EncryptedEnvelope {
        payload: BASE64.encode(encrypted_payload),
        signature: BASE64.encode(signature),
    };

    // 5. Send to sector
    let client = reqwest::Client::new();
    let resp = client.post(target_url)
        .json(&envelope)
        .send()
        .await?;

    let encrypted_response: EncryptedEnvelope = resp.json().await?;

    // 6. Decrypt response
    let encrypted_bytes = BASE64.decode(encrypted_response.payload)?;
    let decrypted_response_bytes = decrypt_from_sector(&encrypted_bytes, &our_private_key)?;

    // 7. Verify signature
    let sig_bytes = BASE64.decode(encrypted_response.signature)?;
    if !verify_signature(&decrypted_response_bytes, &sig_bytes, &sector_public_key) {
        return Err("Invalid signature from sector".into());
    }

    // 8. Parse response
    let response: InterSectorResponse = serde_json::from_slice(&decrypted_response_bytes)?;
    Ok(response)
}
