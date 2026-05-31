use axum::{
    extract::{State},
    routing::{post, get},
    Json, Router,
};
use serde::{Deserialize, Serialize};
use std::sync::{Arc, Mutex};
use std::net::SocketAddr;
use rsa::{RsaPrivateKey, RsaPublicKey, pkcs8::DecodePublicKey, pkcs8::DecodePrivateKey, pkcs8::EncodePrivateKey, Oaep};
use rsa::pkcs1v15::{SigningKey};
use rsa::signature::{RandomizedSigner, SignatureEncoding};
use sha2::Sha256;
use base64::{Engine as _, engine::general_purpose::STANDARD as BASE64};
use chrono::Utc;
use uuid::Uuid;

#[derive(Clone, Copy, Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
enum MockMode {
    Approve,
    CitizenFlagged,
    InvalidSignature,
    Timeout,
}

struct AppState {
    mode: MockMode,
    private_key_pem: String,
    civiccore_public_key_pem: String,
}

#[derive(Serialize, Deserialize, Debug)]
struct EncryptedEnvelope {
    payload: String,
    signature: String,
}

#[derive(Serialize, Deserialize, Debug)]
struct InterSectorRequest {
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
struct InterSectorResponse {
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

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt::init();

    let private_key_pem = std::fs::read_to_string("../keys/health/private.pem").expect("Failed to load health private key");
    let civiccore_public_key_pem = std::fs::read_to_string("../keys/civiccore/public.pem").expect("Failed to load civiccore public key");

    let state = Arc::new(Mutex::new(AppState {
        mode: MockMode::Approve,
        private_key_pem,
        civiccore_public_key_pem,
    }));

    let app = Router::new()
        .route("/query", post(handle_query))
        .route("/demo/set-mode", post(set_mode))
        .route("/demo/mode", get(get_mode))
        .with_state(state);

    let addr = SocketAddr::from(([0, 0, 0, 0], 3001));
    tracing::info!("Mock Health Service listening on {}", addr);
    let listener = tokio::net::TcpListener::bind(addr).await.unwrap();
    axum::serve(listener, app).await.unwrap();
}

async fn handle_query(
    State(state): State<Arc<Mutex<AppState>>>,
    Json(envelope): Json<EncryptedEnvelope>,
) -> Json<EncryptedEnvelope> {
    let (mode, private_key_pem, civiccore_public_key_pem) = {
        let s = state.lock().unwrap();
        (s.mode, s.private_key_pem.clone(), s.civiccore_public_key_pem.clone())
    };

    if mode == MockMode::Timeout {
        tokio::time::sleep(std::time::Duration::from_secs(5)).await;
    }

    // 1. Decrypt request
    let encrypted_bytes = match BASE64.decode(envelope.payload) {
        Ok(b) => b,
        Err(_) => return Json(EncryptedEnvelope { payload: "".into(), signature: "".into() }),
    };
    
    let priv_key = match RsaPrivateKey::from_pkcs8_pem(&private_key_pem) {
        Ok(k) => k,
        Err(e) => {
            tracing::error!("Failed to load private key: {:?}", e);
            return Json(EncryptedEnvelope { payload: "".into(), signature: "".into() });
        }
    };
    
    let decrypted_bytes = match priv_key.decrypt(Oaep::new::<Sha256>(), &encrypted_bytes) {
        Ok(b) => b,
        Err(e) => {
            tracing::error!("Decryption failed: {:?}", e);
            return Json(EncryptedEnvelope { payload: "".into(), signature: "".into() });
        }
    };

    // 2. Parse request
    let request: InterSectorRequest = match serde_json::from_slice(&decrypted_bytes) {
        Ok(r) => r,
        Err(e) => {
            tracing::error!("Failed to parse request: {:?}", e);
            return Json(EncryptedEnvelope { payload: "".into(), signature: "".into() });
        }
    };

    // 3. Generate response
    let (clearance, flags) = match mode {
        MockMode::Approve => ("APPROVED", vec![]),
        MockMode::CitizenFlagged => ("FLAGGED", vec!["HEALTH_RISK".to_string()]),
        _ => ("APPROVED", vec![]),
    };

    let response = InterSectorResponse {
        request_id: request.request_id,
        citizen_id: request.citizen_id,
        query_type: request.query_type,
        responding_sector: "HEALTH_SERVICE".to_string(),
        clearance: clearance.to_string(),
        flags,
        timestamp: Utc::now(),
    };

    let response_bytes = match serde_json::to_vec(&response) {
        Ok(b) => b,
        Err(e) => {
            tracing::error!("Failed to serialize response: {:?}", e);
            return Json(EncryptedEnvelope { payload: "".into(), signature: "".into() });
        }
    };

    // 4. Sign response
    let signing_key_pem = if mode == MockMode::InvalidSignature {
        // Use a wrong key (e.g. education's private key if we had it, but let's just use a fresh one)
        let mut rng = rand::thread_rng();
        let wrong_key = RsaPrivateKey::new(&mut rng, 2048).unwrap();
        wrong_key.to_pkcs8_pem(rsa::pkcs8::LineEnding::LF).unwrap().to_string()
    } else {
        private_key_pem.clone()
    };

    let signing_key = match RsaPrivateKey::from_pkcs8_pem(&signing_key_pem) {
        Ok(k) => k,
        Err(e) => {
            tracing::error!("Failed to load signing key: {:?}", e);
            return Json(EncryptedEnvelope { payload: "".into(), signature: "".into() });
        }
    };
    
    let signer = SigningKey::<Sha256>::new(signing_key);
    let mut rng = rand::thread_rng();
    let signature = signer.sign_with_rng(&mut rng, &response_bytes);

    // 5. Encrypt for CivicCore
    let pub_key = match RsaPublicKey::from_public_key_pem(&civiccore_public_key_pem) {
        Ok(k) => k,
        Err(e) => {
            tracing::error!("Failed to load civiccore public key: {:?}", e);
            return Json(EncryptedEnvelope { payload: "".into(), signature: "".into() });
        }
    };
    
    let encrypted_response = match pub_key.encrypt(&mut rng, Oaep::new::<Sha256>(), &response_bytes) {
        Ok(b) => b,
        Err(e) => {
            tracing::error!("Encryption failed: {:?}", e);
            return Json(EncryptedEnvelope { payload: "".into(), signature: "".into() });
        }
    };

    Json(EncryptedEnvelope {
        payload: BASE64.encode(encrypted_response),
        signature: BASE64.encode(signature.to_bytes().to_vec()),
    })
}

#[derive(Deserialize)]
struct SetModeRequest {
    mode: MockMode,
}

async fn set_mode(
    State(state): State<Arc<Mutex<AppState>>>,
    Json(payload): Json<SetModeRequest>,
) -> Json<serde_json::Value> {
    let mut s = state.lock().unwrap();
    s.mode = payload.mode;
    Json(serde_json::json!({ "success": true, "new_mode": s.mode }))
}

async fn get_mode(
    State(state): State<Arc<Mutex<AppState>>>,
) -> Json<serde_json::Value> {
    let s = state.lock().unwrap();
    Json(serde_json::json!({ "mode": s.mode }))
}
