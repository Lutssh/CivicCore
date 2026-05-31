# How to Run CivicCore

Follow these steps to set up and run the CivicCore prototype in a local development environment.

## Prerequisites

- **Rust:** 1.75+
- **Node.js:** 18+
- **PostgreSQL:** 15+
- **Python:** 3.10+ (with `psycopg2-binary` and `argon2-cffi`)

## 1. Database Setup

1. Create a PostgreSQL database named `civiccore`.
2. Copy `.env.example` to `.env` and set your database credentials. Ensure the `postgres` user has the correct permissions.
3. Apply migrations:
   ```bash
   for f in backend/src/db/migrations/*.sql; do
       sudo -u postgres psql -d civiccore -f "$f"
   done
   ```
4. Seed demo data:
   ```bash
   python3 scripts/seed.py
   ```

## 2. Generate Cryptographic Keys

```bash
python3 scripts/generate_keys.py
```

## 3. Host Mapping

Add the following to your `/etc/hosts` file:
```text
127.0.0.1 civil-registry.civiccore.demo education.civiccore.demo revenue.civiccore.demo labour.civiccore.demo citizen.civiccore.demo verify.civiccore.demo admin.civiccore.demo api.civiccore.demo
```

## 4. Build Frontends

```bash
for f in frontends/*; do
    (cd "$f" && npm install && npm run build)
done
```

## 5. Start Services

Open three terminal windows/sessions:

**Session 1: Backend API**
```bash
cd backend
cargo run
```

**Session 2: Mock Health Service**
```bash
cd mock-health
cargo run
```

**Session 3: Proxy Server**
```bash
sudo node scripts/dev-proxy.js
```

## 6. Accessing the Portals

Open your browser and navigate to:
- Civil Registry: `http://civil-registry.civiccore.demo`
- Education Portal: `http://education.civiccore.demo`
- Revenue Portal: `http://revenue.civiccore.demo`
- Labour Portal: `http://labour.civiccore.demo`
- Verification Terminal: `http://verify.civiccore.demo`
- Admin Console: `http://admin.civiccore.demo`
- Citizen Portal: `http://citizen.civiccore.demo`

**Demo Credentials:**
- **Civil Registry:** `registrar@civiccore.demo` / `Demo@2026`
- **Education:** `education@civiccore.demo` / `Demo@2026`
- **Revenue:** `revenue@civiccore.demo` / `Demo@2026`
- **Labour:** `labour@civiccore.demo` / `Demo@2026`
- **Verify:** `border@civiccore.demo` / `Demo@2026`
- **Admin:** `admin@civiccore.demo` / `Demo@2026`
- **Citizen:** `CM850001AXMR` / `Demo@2026` (James Ssali) or `CF950042NPNR` / `Demo@2026` (Grace Nakato)
