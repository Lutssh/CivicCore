-- Disputes table for citizens to report incorrect records
CREATE TABLE core.disputes (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    citizen_id      VARCHAR(12) NOT NULL REFERENCES core.citizens(citizen_id),
    dispute_type    VARCHAR(50) NOT NULL,
    description     TEXT NOT NULL,
    supporting_info TEXT,
    status          VARCHAR(20) NOT NULL DEFAULT 'OPEN'
                    CHECK (status IN ('OPEN', 'UNDER_REVIEW', 'RESOLVED', 'REJECTED')),
    submitted_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    resolved_at     TIMESTAMPTZ,
    resolution_notes TEXT
);

CREATE INDEX idx_disputes_citizen ON core.disputes(citizen_id);
