# CivicCore — Prototype Executive Summary
### What We Are Building For The June 1st Submission
**Version 1.0 | May 2026 | Personal Reference + Coding Assistant Briefing**

---

> This document describes exactly what the CivicCore prototype is — no more, no less. It is written so that a coding assistant reading it understands the full context, intent, scope, and constraints before writing a single line of code. Every decision here was made deliberately. The reasoning is included so the assistant does not make different assumptions.

---

## 1. What CivicCore Is — In One Paragraph

CivicCore is a national identity and data exchange platform for the fictional Republic of Kavali. It assigns every citizen a single lifelong identifier at birth and creates a secure, controlled mechanism for government institutions to read and write citizen data without exposing records across sectors. The prototype demonstrates the identity core, three working sector integrations, a real cryptographic inter-sector communication protocol, and a mock health sector that simulates approve and reject responses using actual encryption — proving the integration architecture without requiring a full health system to be built.

---

## 2. The Fictional Context

**Country:** Republic of Kavali
**Country code:** C (used in Citizen ID)
**Demo domain structure:** `[sector].civiccore.demo` (local development) or hosted subdomains
**Government body managing the platform:** National ICT Authority (equivalent to Uganda's UCC)

The fictional country removes political sensitivity from the demo. Evaluators project their own country onto it. No real Ugandan institution is named or implied.

---

## 3. The Citizen ID Format

### Format

```
[SEX_COUNTRY][YY][NNNN][LLLL]
```

**Total length: 12 characters. No hyphens. No separators.**

### Breakdown

```
Position 1:    C — Country code, always C for Kavali
Position 2:    M or F — Sex at birth registration (M=Male, F=Female)
Positions 3-4: YY — Last two digits of registration year
Positions 5-8: NNNN — Four digit zero-padded sequence number (global, never resets)
Positions 9-12: LLLL — Four alphanumeric characters (entropy + check)
```

### Character Set For Positions 9-12

Only unambiguous characters are used — characters that cannot be confused when read aloud or handwritten:

```
Digits allowed:    2 3 4 5 6 7 8 9  (excludes 0 and 1 — confused with O and I)
Letters allowed:   A C E F H J K L M N P R T V W X Y  (excludes ambiguous letters)
```

### Examples

```
CM850001AXMR    Male, registered 1985, sequence 0001
CF950042KNTW    Female, registered 1995, sequence 0042
CM260005PHJA    Male, registered 2026, sequence 0005
CF600003WMCE    Female, registered 1960, sequence 0003
CM200002FHKL    Male, registered 2020, sequence 0002
CF900004RNVT    Female, registered 1990, sequence 0004
```

### How It Is Read Aloud

```
CM260005PHJA  →  "C M 26 0005 P H J A"
```

Natural four-part grouping. No hyphens to confuse. Officers and citizens can read it character by character without ambiguity.

### How The Last Four Characters Are Generated

The first two of the four letters (positions 9-10) are derived from a sequence entropy function that makes adjacent IDs non-guessable. The last two (positions 11-12) are a two-character check value calculated using a Luhn-equivalent algorithm over the first ten characters. This means:

- If any character is mistyped, the check fails before the database is queried
- Sequential IDs do not have sequential suffix characters — enumeration is impractical

### The Five Demo Citizens

```
CM850001AXMR    James Ssali — pre-loaded, full lifecycle record
CF950042KNTW    Grace Nakato — pre-loaded, full lifecycle, female
CM600003WMCE    Solomon Okello — pre-loaded, deceased
CM900004RNVT    Pierre Dubois — pre-loaded, foreign national (work permit)
CM200002FHKL    Thomas Ssali — pre-loaded, young child (son of James)
```

The sixth citizen — a newborn — is created live during the demo using the birth registration form. Their ID is generated in real time and assigned sequence 0006.

---

## 4. The Problem Being Solved (Context For The Evaluator)

Government institutions in Uganda and across Africa operate in data silos. The Ministry of Education holds education records. The Revenue Authority holds tax records. The civil registry holds identity records. None of these systems communicate. This causes:

- **Ghost workers** — people paid by government who no longer work there because employment records never synced with payroll
- **Pension fraud** — dead citizens receiving pensions because death records never reached the pension system
- **Data mismatch** — the same citizen's date of birth recorded in three different formats across three ministries
- **Citizen burden** — people carrying paper documents to prove things the government already knows, in different places
- **Governance blindness** — government cannot aggregate data to make evidence-based policy

CivicCore solves this by making the Citizen ID the single key that threads through every government interaction from birth to death. Each sector writes to the citizen's record using that key. Cross-sector communication happens through an encrypted inter-sector protocol. The citizen can see every access to their record. No ministry sees another ministry's data without authorization.

---

## 5. What The Prototype Builds — The Complete List

### 5.1 Seven User Interfaces

Each UI is a separate React application served from a separate subdomain. Each is minimal — functional, dense, professional. No decorative elements.

---

#### UI 1 — Civil Registry Portal
**URL:** `civil-registry.civiccore.demo`
**User:** Hospital registrars, civil registration officers
**Purpose:** Creating citizen records, registering deaths

**Pages:**
1. Login page
2. Dashboard — recent registrations, statistics
3. Birth registration form — creates a citizen record, generates Citizen ID
4. Death registration form — marks citizen as deceased, triggers cascade notifications
5. Citizen search — search by Citizen ID or name
6. Citizen profile view — Tier 1 data only visible from this portal

---

#### UI 2 — Education Authority Portal
**URL:** `education.civiccore.demo`
**User:** School enrollment officers
**Purpose:** Enrolling students, recording examination results

**Pages:**
1. Login page
2. Dashboard
3. Student enrollment form — lookup by Citizen ID, add school and level
4. Examination results form — add PLE/UCE/UACE results to existing record
5. Student record view — education block visible, all other blocks locked

---

#### UI 3 — Revenue Service Portal
**URL:** `revenue.civiccore.demo`
**User:** Tax registration officers
**Purpose:** Registering taxpayers, updating compliance status

**Pages:**
1. Login page
2. Dashboard
3. Taxpayer registration form — lookup by Citizen ID, assign Tax ID, set category
4. Compliance update form — mark citizen as compliant or non-compliant
5. Taxpayer record view — tax block visible, all other blocks locked

---

#### UI 4 — Labour Authority Portal
**URL:** `labour.civiccore.demo`
**User:** Labour officers, employer representatives
**Purpose:** Registering employment, closing employment records

**Pages:**
1. Login page
2. Dashboard
3. Employment registration form — lookup by Citizen ID, add employer and role
4. Employment closure form — record end of employment
5. Employment record view — labour block visible, all other blocks locked

---

#### UI 5 — Citizen Portal
**URL:** `citizen.civiccore.demo`
**User:** Citizens of Kavali
**Purpose:** Citizens viewing their own record and audit log

**Pages:**
1. Login page — citizen authenticates with Citizen ID + password
2. My profile — Tier 1 data, photo, family links
3. My records — all sector blocks, locked ones show "held by [authority]"
4. My audit log — full history of every access to their record
5. Raise a dispute — flag an incorrect entry (form submission only, no resolution logic)

---

#### UI 6 — Automated Verification Terminal
**URL:** `verify.civiccore.demo`
**User:** Border control officers, inter-agency automated systems
**Purpose:** Demonstrating automated encrypted inter-sector queries

**Pages:**
1. Query terminal — enter Citizen ID, select query type, run query
2. Response display — structured result with photo, clearance status, tier labels, response time
3. Query history — all queries run from this terminal with timestamps

---

#### UI 7 — System Administration Console
**URL:** `admin.civiccore.demo`
**User:** National ICT Authority administrators
**Purpose:** Central oversight of the entire platform

**Pages:**
1. Login page
2. System dashboard — total citizens, records per sector, queries today, system health
3. User management — all portal users, roles, last login
4. System-wide audit log — every action across all portals
5. Sector health — each sector's status, last write, record count, encryption key status

---

### 5.2 The Core Backend — Six Modules

#### Module 1 — Citizen Registration
Handles birth registration. Generates the Citizen ID. Links parents. Creates empty sector blocks. Writes first audit log entry. Issues digital birth certificate as a formatted record.

#### Module 2 — Citizen Profile
Assembles and serves the citizen's complete record. Applies role-based filtering — each role sees different blocks. Returns Tier 1 always, Tier 2 flags if authorized, locked indicators for unauthorized blocks.

#### Module 3 — Three Sector Writers
Each sector (Education, Revenue, Labour) has a write endpoint. Validates the Citizen ID, validates the submitted data against the sector schema, writes to the sector block, logs the write to the audit log.

#### Module 4 — Role-Based Access Control
Every request is authenticated. Every authenticated user has a role. Every role has a permission set. Permissions are checked before any data is read or written. Unauthorized attempts are blocked and logged.

#### Module 5 — Inter-Sector Encrypted Communication Protocol
The core security demonstration. CivicCore sends encrypted requests to sector services (including the mock health service) using asymmetric encryption. Responses are encrypted back. CivicCore decrypts, verifies signatures, handles failures. All exchanges are logged.

#### Module 6 — Immutable Audit Log
Every action in the system writes an audit entry. No endpoint exists to edit or delete audit entries. The audit log is visible to citizens for their own record and to administrators for all records.

---

### 5.3 The Mock Health Service

The health sector is not built as a full platform. Instead a small mock service handles encrypted inter-sector communication to demonstrate the security protocol in both success and failure states.

**What it does:**
- Receives encrypted requests from CivicCore using the health sector's private key
- Decrypts the request
- Based on the demo control panel toggle, generates an approve or reject response
- Encrypts the response with CivicCore's public key
- Returns it

**Demo control panel toggles:**
- APPROVE — health returns clearance approved
- CITIZEN_FLAGGED — health returns flagged status
- INVALID_SIGNATURE — health returns a response signed with wrong key (simulates tampered response)
- TIMEOUT — health service does not respond within the timeout window

Each toggle produces a different visible outcome on the verification terminal — demonstrating not just the happy path but the full failure handling capability.

**Why this is not a shortcut:** The cryptographic operations are real. Asymmetric encryption, signature generation, signature verification, and failure handling all use production-grade cryptographic libraries. Only the decision logic inside the health service is mocked.

---

## 6. The Three Data Tiers — How They Appear In The Prototype

### Tier 1 — Open Identity
Stored unencrypted. Readable by any authenticated system.

Fields stored:
- Citizen ID
- Full name
- Sex
- Year of birth
- District of birth
- Nationality
- Status (active / deceased)
- Photo reference
- Family links (parent IDs, spouse ID, children IDs)
- Hash of date of birth (for consistency verification, not the DOB itself)

### Tier 2 — Encrypted Status Flags
Stored encrypted. Readable only by authorized sector systems. In the prototype, encryption is demonstrated using the inter-sector protocol. The flags themselves are:

- Tax compliance status (COMPLIANT / NON-COMPLIANT / UNREGISTERED)
- Employment status (EMPLOYED / UNEMPLOYED / SELF_EMPLOYED / UNREGISTERED)
- Education level (NONE / PRIMARY / SECONDARY / TERTIARY)
- NSSF contribution status (ACTIVE / INACTIVE / UNREGISTERED)
- Criminal record existence (YES / NO / UNKNOWN)
- Travel clearance (CLEAR / FLAGGED / RESTRICTED)

### Tier 3 — Sensitive Records (Not Built, Shown As Reference)
Full sector records. In the prototype, every citizen profile shows a health block that reads:

```
HEALTH RECORDS
Status: Held by National Health Service
🔒 Access requires NHS authentication
   or court order for cross-sector read

[Sector not yet onboarded to CivicCore.
 Integration architecture designed.]
```

This is honest — the slot exists, the architecture anticipates it, the sector has not connected yet.

---

## 7. Security Demonstration Points

The prototype demonstrates security in five concrete ways:

### 7.1 Visible Access Blocks With Logged Attempts
When an unauthorized role attempts to view a sector block, the block shows locked with the message "Access attempt logged." The audit log immediately shows the blocked attempt.

### 7.2 Encryption Indicator Per Block
Each sector block displays:
```
🔐 AES-256 Encrypted  |  Key holder: [Sector Name]  |  ICT Authority access: ❌
```
This is the production intent shown as a UI label. The inter-sector protocol implements this for real.

### 7.3 Real Encrypted Inter-Sector Protocol
When the verification terminal runs a BORDER_CLEARANCE query:
- CivicCore encrypts the request with the health sector's public key
- The mock health service decrypts with its private key
- The response is encrypted with CivicCore's public key
- CivicCore decrypts and verifies the signature
- The terminal displays response time under one second

The audit log shows the full exchange including which keys were used.

### 7.4 Tampered Response Detection
When the demo control is set to INVALID_SIGNATURE:
- The mock health service signs the response with a wrong key
- CivicCore signature verification fails
- The terminal shows SECURITY ALERT — tampered response detected
- The query result is marked INCONCLUSIVE, not acted upon
- Security alert is logged

### 7.5 Role Boundary Enforcement
A revenue officer attempting to access the education portal URL receives an ACCESS DENIED page stating their role, the denied resource, and confirmation that the attempt was logged.

---

## 8. What The Demo Proves To Evaluators

In five minutes the demo tells this story:

1. A newborn is registered. A Citizen ID generates instantly. A child now exists in the national record.
2. The same ID is used to enroll the child in school. The education block populates.
3. An adult citizen (pre-loaded) has education, tax, and employment all linked through one ID.
4. Logging in as different roles shows the same record with different visibility. Same data, different keys, different views.
5. The citizen logs in and sees every access to their record — including the blocked attempt by the revenue officer.
6. The verification terminal runs an automated border query. Response in under one second. Tier labels show exactly what data was and was not included.
7. The demo control toggles health to INVALID_SIGNATURE. The query runs again. The system detects the tampered response and raises a security alert. The query is not acted upon.

That sequence demonstrates: identity creation, cross-sector record building, role-based access control, citizen transparency, automated verification, tiered data minimization, and real cryptographic failure handling.

---

## 9. What Is Explicitly Not Built

The following are designed but not implemented in the prototype. They are documented in the architecture reference and noted in the submission:

- Full Ministry of Health platform
- HSM key management (mocked with file-based keys in the prototype)
- USSD and SMS fallback
- Offline capability
- Court order access mechanism
- Real fingerprint biometric integration
- Liveness detection
- Full pension and social security sector
- Immigration and passport issuance workflow
- The full district-level geographic data

---

## 10. The Demo Pre-loaded Data

### Five Pre-loaded Citizens

**CM850001AXMR — James Ssali (Male, 1985)**
Full lifecycle. Education: UCE + UACE + Makerere University BSc. Tax: registered, compliant, TIN assigned. Labour: employed at Kavali National Bank, formal, NSSF active. Married to Grace (CF950042KNTW). Father of Thomas (CM200002FHKL).

**CF950042KNTW — Grace Nakato (Female, 1995)**
Full lifecycle. Education: UCE + UACE + Makerere University BA. Tax: registered, compliant. Labour: employed at Kavali Ministry of Finance. Married to James. Mother of Thomas.

**CM600003WMCE — Solomon Okello (Male, 1960)**
Deceased. Registered death 2024. Shows: status marked deceased, audit log shows death cascade — voter roll removal triggered, pension flagged, employer notified.

**CM900004RNVT — Pierre Dubois (Male, 1990)**
Foreign national. Work permit holder. Not a citizen. Different record type. Employment registered at Kavali Tech Ltd. No education or tax block — only identity and labour.

**CM200002FHKL — Thomas Ssali (Male, 2020)**
Young child. Only birth record and education enrollment (primary school). Parents linked: James and Grace. No tax or labour records — demonstrates the system at an early life stage.

### The Live Demo Citizen
Created during the demo using the birth registration form. Sequence 0006. Sex and name entered live. ID generated on screen.

---

## 11. Technology Stack Summary

**Backend core:** Rust using Axum web framework
- All API endpoints
- All background workers
- Cryptographic operations (asymmetric encryption, signature verification)
- Database interaction layer
- The inter-sector encrypted communication protocol
- The mock health service endpoint

**Scripts and workers:** Python
- Database seeding scripts (loading demo citizens)
- Background job orchestration
- Admin tooling

**Frontend:** React with TypeScript
- All seven UIs
- Minimal styling — functional, dense, professional
- No UI component library that imposes visual design — plain HTML elements with minimal CSS

**Database:** PostgreSQL
- Single database, multiple schemas (one per sector)
- Row-level security enforced at application layer
- Audit log table append-only by design

**Cryptography:** RSA-2048 asymmetric encryption for inter-sector protocol, SHA-256 for hashing, HMAC for signature verification — all using established Rust cryptographic crates (ring or RustCrypto)

**Hosting:** Single VPS. Nginx reverse proxy routing subdomains to respective React builds and Rust API.

---

## 12. The Submission Document Statement On Security

The prototype submission document includes this statement verbatim:

> *"The prototype implements role-based access control, immutable audit logging, tiered data visibility, and a real asymmetric encryption protocol for inter-sector communication including tampered response detection. In the production system, ministry-held encryption keys are stored in Hardware Security Modules, multi-party authorization governs court order access, and zero-knowledge hash verification ensures cross-sector data consistency. These production components are fully designed and architecturally documented. They require infrastructure beyond prototype scope to implement."*

---

*End of Prototype Executive Summary*

