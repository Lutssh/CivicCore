-- Audit and Crypto tables

-- Audit log (Append-only)
CREATE TABLE audit.log (
    id              BIGSERIAL PRIMARY KEY,
    event_id        UUID NOT NULL DEFAULT gen_random_uuid(),
    citizen_id      VARCHAR(12),                -- The citizen whose record was accessed
    actor_user_id   UUID,                       -- The user who performed the action
    actor_role      VARCHAR(50) NOT NULL,
    actor_sector    VARCHAR(50),
    action          VARCHAR(100) NOT NULL,
    sector_accessed VARCHAR(50),               -- Which sector block was accessed
    outcome         VARCHAR(20) NOT NULL CHECK (outcome IN (
                        'SUCCESS', 'BLOCKED', 'FAILED', 'SECURITY_ALERT'
                    )),
    ip_address      INET,
    details         JSONB,                     -- Additional context
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_citizen ON audit.log(citizen_id);
CREATE INDEX idx_audit_created ON audit.log(created_at);
CREATE INDEX idx_audit_actor ON audit.log(actor_user_id);

-- Cryptographic key storage
CREATE TABLE crypto.sector_keys (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sector_name     VARCHAR(50) NOT NULL UNIQUE,
    public_key_pem  TEXT NOT NULL,              -- PEM-encoded RSA public key
    key_fingerprint VARCHAR(64) NOT NULL,       -- SHA-256 of public key
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Tier 2 encrypted status flags
CREATE TABLE core.tier2_flags (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    citizen_id      VARCHAR(12) NOT NULL REFERENCES core.citizens(citizen_id),
    sector          VARCHAR(50) NOT NULL,
    flag_name       VARCHAR(100) NOT NULL,
    encrypted_value TEXT NOT NULL,             -- Encrypted with sector's public key
    last_updated    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_by      UUID REFERENCES core.users(id),
    UNIQUE(citizen_id, sector, flag_name)
);

CREATE INDEX idx_tier2_citizen ON core.tier2_flags(citizen_id);
