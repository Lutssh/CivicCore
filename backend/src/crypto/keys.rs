use std::fs;

pub fn load_private_key(sector: &str) -> Result<String, std::io::Error> {
    let path = format!("../keys/{}/private.pem", sector);
    fs::read_to_string(path)
}

pub fn load_public_key(sector: &str) -> Result<String, std::io::Error> {
    let path = format!("../keys/{}/public.pem", sector);
    fs::read_to_string(path)
}
