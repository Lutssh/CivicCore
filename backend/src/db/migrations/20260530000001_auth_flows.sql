-- OTP codes for citizen registration and password reset
CREATE TABLE core.otp_codes (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    phone       VARCHAR(20) NOT NULL,
    code        VARCHAR(6)  NOT NULL,
    purpose     VARCHAR(32) NOT NULL CHECK (purpose IN ('CITIZEN_REGISTER', 'CITIZEN_RESET')),
    expires_at  TIMESTAMPTZ NOT NULL,
    used_at     TIMESTAMPTZ,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Setup tokens for official account activation
CREATE TABLE core.setup_tokens (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL REFERENCES core.users(id) ON DELETE CASCADE,
    token       UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
    token_type  VARCHAR(32) NOT NULL CHECK (token_type IN ('OFFICIAL_SETUP', 'PASSWORD_RESET')),
    expires_at  TIMESTAMPTZ NOT NULL,
    used_at     TIMESTAMPTZ,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Add columns to core.users required by the design doc
ALTER TABLE core.users
    ADD COLUMN IF NOT EXISTS status  VARCHAR(32) NOT NULL DEFAULT 'ACTIVE'
        CHECK (status IN ('PENDING_SETUP', 'ACTIVE', 'SUSPENDED', 'DEACTIVATED')),
    ADD COLUMN IF NOT EXISTS phone   VARCHAR(20),
    ADD COLUMN IF NOT EXISTS provisioned_by UUID REFERENCES core.users(id);

-- Backfill existing rows (seeded users are already active)
UPDATE core.users SET status = 'ACTIVE' WHERE status IS NULL;
