use rsa::{RsaPrivateKey, RsaPublicKey, pkcs8::DecodePublicKey, pkcs8::DecodePrivateKey, Oaep};
use rsa::pkcs1v15::{SigningKey, VerifyingKey};
use rsa::signature::{Verifier, RandomizedSigner, SignatureEncoding};
use sha2::Sha256;
use std::error::Error;

pub type CryptoResult<T> = Result<T, Box<dyn Error + Send + Sync>>;

/// Encrypt a message with a recipient's public key
pub fn encrypt_for_sector(
    plaintext: &[u8],
    recipient_public_key_pem: &str
) -> CryptoResult<Vec<u8>> {
    let public_key = RsaPublicKey::from_public_key_pem(recipient_public_key_pem)?;
    let mut rng = rand::thread_rng();
    let encrypted = public_key.encrypt(
        &mut rng,
        Oaep::new::<Sha256>(),
        plaintext
    )?;
    Ok(encrypted)
}

/// Decrypt a message with our own private key
pub fn decrypt_from_sector(
    ciphertext: &[u8],
    our_private_key_pem: &str
) -> CryptoResult<Vec<u8>> {
    let private_key = RsaPrivateKey::from_pkcs8_pem(our_private_key_pem)?;
    let decrypted = private_key.decrypt(
        Oaep::new::<Sha256>(),
        ciphertext
    )?;
    Ok(decrypted)
}

/// Sign a message with our private key
pub fn sign_message(
    message: &[u8],
    our_private_key_pem: &str
) -> CryptoResult<Vec<u8>> {
    let private_key = RsaPrivateKey::from_pkcs8_pem(our_private_key_pem)?;
    let signing_key = SigningKey::<Sha256>::new(private_key);
    let mut rng = rand::thread_rng();
    let signature = signing_key.sign_with_rng(&mut rng, message);
    Ok(signature.to_bytes().to_vec())
}

/// Verify a signature
pub fn verify_signature(
    message: &[u8],
    signature_bytes: &[u8],
    sender_public_key_pem: &str
) -> bool {
    let Ok(public_key) = RsaPublicKey::from_public_key_pem(sender_public_key_pem) else {
        return false;
    };
    let verifying_key = VerifyingKey::<Sha256>::new(public_key);
    let Ok(signature) = rsa::pkcs1v15::Signature::try_from(signature_bytes) else {
        return false;
    };
    verifying_key.verify(message, &signature).is_ok()
}
