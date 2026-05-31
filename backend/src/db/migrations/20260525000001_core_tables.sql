-- Core tables for identity and auth

-- Citizens table
CREATE TABLE core.citizens (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    citizen_id          VARCHAR(12) UNIQUE NOT NULL,
    full_name           VARCHAR(255) NOT NULL,
    sex                 VARCHAR(1) NOT NULL CHECK (sex IN ('M', 'F')),
    year_of_birth       SMALLINT NOT NULL,
    date_of_birth_hash  VARCHAR(64),          -- SHA-256 hash of DOB, not DOB itself
    district_of_birth   VARCHAR(100) NOT NULL,
    place_of_birth      VARCHAR(255),          -- Hospital name or 'Home'
    nationality         VARCHAR(100) NOT NULL DEFAULT 'Kavali',
    status              VARCHAR(20) NOT NULL DEFAULT 'ACTIVE'
                        CHECK (status IN ('ACTIVE', 'DECEASED', 'SUSPENDED')),
    father_citizen_id   VARCHAR(12) REFERENCES core.citizens(citizen_id),
    mother_citizen_id   VARCHAR(12) REFERENCES core.citizens(citizen_id),
    spouse_citizen_id   VARCHAR(12) REFERENCES core.citizens(citizen_id),
    photo_path          VARCHAR(500),          -- File path to stored photo
    is_foreign_national BOOLEAN NOT NULL DEFAULT FALSE,
    registered_by       UUID,                  -- User ID of registrar (can be null for initial seed)
    registered_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    death_registered_at TIMESTAMPTZ,
    death_registered_by UUID
);

CREATE INDEX idx_citizens_citizen_id ON core.citizens(citizen_id);
CREATE INDEX idx_citizens_full_name ON core.citizens(full_name);
CREATE INDEX idx_citizens_status ON core.citizens(status);

-- Junction table for parent-child links
CREATE TABLE core.citizen_children (
    parent_citizen_id   VARCHAR(12) NOT NULL REFERENCES core.citizens(citizen_id),
    child_citizen_id    VARCHAR(12) NOT NULL REFERENCES core.citizens(citizen_id),
    relationship        VARCHAR(20) NOT NULL CHECK (relationship IN ('BIOLOGICAL', 'ADOPTED')),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (parent_citizen_id, child_citizen_id)
);

-- Users table
CREATE TABLE core.users (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email           VARCHAR(255) UNIQUE NOT NULL,
    password_hash   VARCHAR(255) NOT NULL,    -- Argon2id hash
    role            VARCHAR(50) NOT NULL CHECK (role IN (
                        'CIVIL_REGISTRAR',
                        'EDUCATION_OFFICER',
                        'REVENUE_OFFICER',
                        'LABOUR_OFFICER',
                        'CITIZEN',
                        'BORDER_OFFICER',
                        'SYSTEM_ADMIN'
                    )),
    citizen_id      VARCHAR(12) REFERENCES core.citizens(citizen_id),
                    -- Only populated for CITIZEN role
    full_name       VARCHAR(255) NOT NULL,
    sector          VARCHAR(50),              -- Which sector this user belongs to
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    last_login_at   TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Now that users table exists, we can add the FK to citizens
ALTER TABLE core.citizens ADD CONSTRAINT fk_registered_by FOREIGN KEY (registered_by) REFERENCES core.users(id);
ALTER TABLE core.citizens ADD CONSTRAINT fk_death_registered_by FOREIGN KEY (death_registered_by) REFERENCES core.users(id);

-- Sessions table
CREATE TABLE core.sessions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES core.users(id),
    token_hash      VARCHAR(255) NOT NULL UNIQUE,
    expires_at      TIMESTAMPTZ NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ip_address      INET,
    user_agent      TEXT
);

CREATE INDEX idx_sessions_token_hash ON core.sessions(token_hash);
CREATE INDEX idx_sessions_expires_at ON core.sessions(expires_at);

-- Global sequence for Citizen ID generation
CREATE TABLE core.sequence_counter (
    id              INTEGER PRIMARY KEY DEFAULT 1,
    current_value   INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT single_row CHECK (id = 1)
);

-- Initialize sequence at 5 as per TRD (for pre-seeded citizens)
INSERT INTO core.sequence_counter (id, current_value) VALUES (1, 5);
