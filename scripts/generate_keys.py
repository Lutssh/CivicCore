from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.hazmat.primitives import serialization
import os

SECTORS = ['civiccore', 'civil-registry', 'education', 'revenue', 'labour', 'health']

def generate_keys():
    for sector in SECTORS:
        print(f"Generating keys for {sector}...")
        private_key = rsa.generate_private_key(
            public_exponent=65537,
            key_size=4096
        )
        os.makedirs(f'keys/{sector}', exist_ok=True)
        
        # Save private key (NEVER commit this)
        private_pem_path = f'keys/{sector}/private.pem'
        with open(private_pem_path, 'wb') as f:
            f.write(private_key.private_bytes(
                serialization.Encoding.PEM,
                serialization.PrivateFormat.PKCS8,
                serialization.NoEncryption()
            ))
        
        # Save public key (safe to share)
        public_pem_path = f'keys/{sector}/public.pem'
        with open(public_pem_path, 'wb') as f:
            f.write(private_key.public_key().public_bytes(
                serialization.Encoding.PEM,
                serialization.PublicFormat.SubjectPublicKeyInfo
            ))
        print(f"Keys generated and saved in keys/{sector}/")

if __name__ == "__main__":
    generate_keys()
