-- Sector specific tables

-- Education sector
CREATE TABLE education.records (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    citizen_id          VARCHAR(12) NOT NULL REFERENCES core.citizens(citizen_id),
    institution_name    VARCHAR(255) NOT NULL,
    institution_type    VARCHAR(50) NOT NULL CHECK (institution_type IN (
                            'PRIMARY', 'SECONDARY', 'TERTIARY', 'VOCATIONAL'
                        )),
    enrollment_date     DATE NOT NULL,
    completion_date     DATE,
    status              VARCHAR(20) NOT NULL DEFAULT 'ENROLLED'
                        CHECK (status IN ('ENROLLED', 'COMPLETED', 'DROPPED_OUT', 'TRANSFERRED')),
    recorded_by         UUID NOT NULL REFERENCES core.users(id),
    recorded_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE education.examination_results (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    citizen_id          VARCHAR(12) NOT NULL REFERENCES core.citizens(citizen_id),
    exam_type           VARCHAR(20) NOT NULL CHECK (exam_type IN ('PLE', 'UCE', 'UACE', 'DEGREE', 'DIPLOMA')),
    year_of_exam        SMALLINT NOT NULL,
    grade               VARCHAR(50) NOT NULL,
    institution         VARCHAR(255),
    recorded_by         UUID NOT NULL REFERENCES core.users(id),
    recorded_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_education_citizen ON education.records(citizen_id);

-- Revenue sector
CREATE TABLE revenue.records (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    citizen_id              VARCHAR(12) NOT NULL UNIQUE
                            REFERENCES core.citizens(citizen_id),
    tax_id                  VARCHAR(20) NOT NULL UNIQUE,  -- Generated TIN
    taxpayer_category       VARCHAR(20) NOT NULL CHECK (taxpayer_category IN (
                                'INDIVIDUAL', 'SOLE_PROPRIETOR', 'COMPANY_DIRECTOR'
                            )),
    compliance_status       VARCHAR(20) NOT NULL DEFAULT 'REGISTERED'
                            CHECK (compliance_status IN (
                                'COMPLIANT', 'NON_COMPLIANT', 'REGISTERED', 'SUSPENDED'
                            )),
    registration_date       DATE NOT NULL DEFAULT CURRENT_DATE,
    last_filing_date        DATE,
    last_filing_period      VARCHAR(20),    -- e.g. '2025-Q4'
    registered_by           UUID NOT NULL REFERENCES core.users(id),
    registered_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_by              UUID REFERENCES core.users(id)
);

CREATE INDEX idx_revenue_citizen ON revenue.records(citizen_id);
CREATE INDEX idx_revenue_tax_id ON revenue.records(tax_id);

-- Labour sector
CREATE TABLE labour.records (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    citizen_id          VARCHAR(12) NOT NULL REFERENCES core.citizens(citizen_id),
    employer_name       VARCHAR(255) NOT NULL,
    employer_tin        VARCHAR(20),                -- Employer's tax ID if registered
    job_title           VARCHAR(255) NOT NULL,
    employment_type     VARCHAR(20) NOT NULL CHECK (employment_type IN (
                            'FORMAL', 'INFORMAL', 'CONTRACT', 'SELF_EMPLOYED'
                        )),
    start_date          DATE NOT NULL,
    end_date            DATE,
    status              VARCHAR(20) NOT NULL DEFAULT 'ACTIVE'
                        CHECK (status IN ('ACTIVE', 'CLOSED', 'DISPUTED')),
    nssf_number         VARCHAR(50),
    nssf_status         VARCHAR(20) NOT NULL DEFAULT 'INACTIVE'
                        CHECK (nssf_status IN ('ACTIVE', 'INACTIVE', 'SUSPENDED')),
    recorded_by         UUID NOT NULL REFERENCES core.users(id),
    recorded_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    closed_by           UUID REFERENCES core.users(id),
    closed_at           TIMESTAMPTZ
);

CREATE INDEX idx_labour_citizen ON labour.records(citizen_id);
