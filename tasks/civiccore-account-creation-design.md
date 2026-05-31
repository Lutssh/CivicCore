# CivicCore — Account Creation, Roles & Verification Design
**Internal Reference | Prototype Scope**
Version 1.0 | May 2026

---

## 1. The Core Principle

Officials are **provisioned, not self-registered.** There is no public signup flow for government officials. A citizen-facing self-registration exists but is anchored entirely to the civil registry record — a citizen cannot create an account unless they already exist in `core.citizens`.

These are two completely separate flows that share no UI, no routes, and no logic.

---

## 2. Role Hierarchy

```
ICT ADMIN  (National ICT Authority)
    │   Seeded at deployment. Never created through UI.
    │
    └──creates──▶  MINISTRY ADMIN  (one per agency)
                        │   e.g. Civil Registry Admin, URA Admin
                        │
                        └──creates──▶  OFFICERS  (scoped to their agency only)
                                           e.g. REGISTRAR, TAX_OFFICER,
                                                WELFARE_OFFICER, BORDER_OFFICER
```

### Rules

- **ICT Admin** is the bootstrap account. It exists via `seed.py`. No UI creates it. This is non-negotiable — a super admin account must never be creatable through a public interface.
- **Ministry Admin** is created exclusively by ICT Admin. A Ministry Admin belongs to exactly one agency and cannot act outside it.
- **Officers** are created exclusively by the Ministry Admin of their agency. A Civil Registry Ministry Admin cannot create a URA Tax Officer. Cross-agency provisioning is blocked at the API level.
- **Citizens** are a completely separate account type. They are not part of this hierarchy.

### Role Reference Table

| Role | Created By | Scope | Portal |
|---|---|---|---|
| `ICT_ADMIN` | Seed only | Platform-wide | `admin.civiccore.demo` |
| `MINISTRY_ADMIN` | ICT Admin | Single agency | `admin.civiccore.demo` |
| `REGISTRAR` | Ministry Admin (Civil Registry) | Civil Registry only | `civil-registry.civiccore.demo` |
| `TAX_OFFICER` | Ministry Admin (URA) | Revenue only | `revenue.civiccore.demo` |
| `WELFARE_OFFICER` | Ministry Admin (Social Dev) | Social Dev only | `social.civiccore.demo` |
| `BORDER_OFFICER` | Ministry Admin (Immigration) | Immigration only | `immigration.civiccore.demo` |
| `CITIZEN` | Self-registration | Own record only | `citizen.civiccore.demo` |

---

## 3. Official Account Provisioning Flow

### Why Not Immediate Activation

If an account is active the moment the admin submits the form, anyone who gains brief access to the admin panel can create rogue officials. The provisioning flow uses two separate gates:

1. ICT Admin or Ministry Admin creates the account — it is `PENDING`, not active
2. The official receives an email with a setup link and activates their own account

The provisioning admin never sets the password. They cannot know the official's credentials. Even a rogue account creation requires inbox access to the work email to activate.

### Step-by-Step Flow

```
Step 1 — Admin fills provisioning form
    Fields: Full Name, Work Email, Phone Number, Role, Agency
    Work email must match agency domain: @civil-registry.civiccore.demo
    System validates all fields. Rejects personal email domains.

Step 2 — Account created as PENDING
    Row inserted into core.users with status: PENDING_SETUP
    A one-time setup token is generated (UUID, expires 24 hours)
    Token stored in core.setup_tokens linked to user ID

Step 3 — Setup email sent to work email
    Email contains a single link:
    https://admin.civiccore.demo/setup?token=<uuid>
    No password is in this email. The link IS the credential at this stage.

Step 4 — Official clicks link
    System validates token: exists, not expired, not already used
    Official is shown a password setup page (not login, not signup — a dedicated /setup route)
    Official sets password. Password requirements enforced.
    Token is marked as used and deleted.

Step 5 — Account activated
    core.users status updated to ACTIVE
    Official can now log in at their agency portal using work email + password
```

### Provisioning Form Fields

```
Full Legal Name       [required]
Work Email            [required] — enforced domain validation
Phone Number          [required] — for future 2FA, logged for audit
Role                  [required] — dropdown, options filtered by who is provisioning
Agency / Ministry     [required] — auto-filled if Ministry Admin, selectable if ICT Admin
Employee ID           [optional] — internal HR reference number
```

---

## 4. Admin UI — Single Portal, Role-Based Rendering

### Decision: One URL, Not Per-Agency Subdomains

`admin.civiccore.demo:8080` is the single admin portal. There are no per-agency subdomains like `admin.education.civiccore.demo`.

**Reason:** Per-agency subdomains add routing complexity, separate SSL configuration, and separate deployments for zero meaningful security or UX gain at prototype stage. Role-based rendering achieves the same separation more cleanly.

### What ICT Admin Sees

```
Sidebar:
├── Dashboard          (platform-wide stats — total agencies, total officials, total citizens)
├── Agencies           (list of all registered agencies)
├── Officials          (all officials across all agencies, filterable by agency)
├── Provision Official (form — can select any agency and any role)
├── Audit Log          (platform-wide access log)
└── System Settings
```

### What Ministry Admin Sees

```
Sidebar:
├── Dashboard          (their agency stats only)
├── Officers           (only officers within their agency)
├── Provision Officer  (form — agency pre-filled, role options limited to their agency's roles)
├── Audit Log          (their agency's access log only)
└── Settings
```

Same codebase. Same URL. The sidebar items, data returned by the API, and form options all change based on the authenticated user's role. ICT Admin and Ministry Admin never see each other's provisioning forms in the same view.

---

## 5. Work Email — Non-Negotiable

Personal emails (Gmail, Yahoo, Outlook personal) are rejected for official accounts.

**Why:**
- The organization must control the email account. If an officer resigns or is dismissed, the work email is deactivated — this immediately kills any password reset or re-activation path.
- A personal email proves nothing about organizational affiliation.
- Personal emails can be abandoned, sold, or compromised without the organization knowing.

**Enforced domain format:**

```
civil-registry   →   @civil-registry.civiccore.demo
revenue          →   @revenue.civiccore.demo
health           →   @health.civiccore.demo
education        →   @education.civiccore.demo
social           →   @social.civiccore.demo
immigration      →   @immigration.civiccore.demo
```

In production this maps to real government ministry domains. In the prototype the domain format is enforced in validation and the agency domain is pre-defined per agency record in the database.

---

## 6. Citizen Self-Registration Flow

### Anchor: The Civil Registry Record

A citizen cannot create a portal account unless they already exist in `core.citizens`. The registration is not creating an identity — the identity already exists. The registration is creating login credentials to access that existing identity record.

### Step-by-Step Flow

```
Step 1 — Citizen enters their details
    Fields:
    - Citizen ID (e.g. KV-1995-0042) — must exist in core.citizens
    - Phone Number — must match the phone number on their civil record
    - Email Address — personal email is acceptable for citizens

Step 2 — System validates against civil record
    Citizen ID found in core.citizens? → proceed
    Phone number matches record? → proceed
    Either fails → generic error, no detail about which field failed

Step 3 — OTP sent to phone number on record
    A 6-digit OTP is generated, stored with 10-minute expiry
    Sent via SMS gateway (Mailtrap in prototype — see Section 8)
    Citizen enters OTP on next screen

Step 4 — OTP verified
    If valid: citizen proceeds to password setup
    If expired or wrong: error, option to resend

Step 5 — Citizen sets password
    Password requirements enforced
    Row inserted into core.users with role: CITIZEN, status: ACTIVE
    Citizen is logged in and redirected to citizen portal
```

### Why Phone OTP, Not Email Verification

The phone number is already in the civil registry record — it is a fact the system already knows. Verifying against it proves the citizen has access to a device registered to that record. An email address typed into the form is something the citizen just provided — the system has no way to independently verify it belongs to them without a separate process.

Phone OTP = verifying against existing civil record. That is the security anchor.

---

## 7. Security Notes

### Password Reset — Officials

Password reset for officials goes to their work email only. There is no alternative recovery path. If the work email is inaccessible, the Ministry Admin must deactivate and re-provision the account. This is intentional — the work email is the organizational credential.

### Password Reset — Citizens

Citizens reset via phone OTP. Same flow as registration step 3 onward. No email-based reset because the email was self-provided and unverified.

### Token Expiry

| Token Type | Expiry |
|---|---|
| Official setup link | 24 hours |
| Citizen OTP | 10 minutes |
| Password reset link (official) | 1 hour |
| Session token | 8 hours (officials), 24 hours (citizens) |

### What Is Never Done

- No admin ever sets another user's password directly
- No signup page exists alongside the login page for officials
- No account is ever immediately active without the user's own action
- Citizen registration never creates a record in `core.citizens` — it only creates in `core.users` if the civil record already exists

---

## 8. Email and OTP Delivery — Prototype Strategy

### Decision: Mailtrap SMTP

Real email providers (Gmail SMTP, SendGrid, AWS SES) are not integrated in the prototype. Instead, **Mailtrap** is used.

**What Mailtrap is:** A fake SMTP inbox service. The backend sends real emails using standard SMTP code. Instead of delivering to real inboxes, all emails land in a Mailtrap web dashboard that is controlled during the demo.

**Why this is the right prototype choice:**
- The backend email code is production-identical — only the SMTP credentials differ
- Evaluators see the actual email arrive in real time during the demo
- No spam filter failures, no email delays, full control
- Demonstrates the real concept without any mail server infrastructure

**What the backend sends:**

```
Official Setup Email:
    To:      work email provided by admin
    Subject: Your CivicCore account has been created
    Body:    Name, role, agency, setup link (expires 24hrs), instructions

Citizen OTP:
    Sent as SMS in production
    In prototype: sent as email to Mailtrap with subject "Your CivicCore verification code"
    Body contains the 6-digit code clearly displayed
```

### Mailtrap Configuration

```env
SMTP_HOST=sandbox.smtp.mailtrap.io
SMTP_PORT=2525
SMTP_USER=<mailtrap_user>
SMTP_PASS=<mailtrap_pass>
MAIL_FROM=noreply@civiccore.demo
```

These values go in the `.env` file. The rest of the email logic is production-ready code.

---

## 9. Database Tables Required

### `core.setup_tokens`

```sql
CREATE TABLE core.setup_tokens (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL REFERENCES core.users(id) ON DELETE CASCADE,
    token       UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
    token_type  VARCHAR(32) NOT NULL,  -- 'OFFICIAL_SETUP' | 'PASSWORD_RESET'
    expires_at  TIMESTAMPTZ NOT NULL,
    used_at     TIMESTAMPTZ,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);
```

### `core.otp_codes`

```sql
CREATE TABLE core.otp_codes (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    phone       VARCHAR(20) NOT NULL,
    code        VARCHAR(6) NOT NULL,
    purpose     VARCHAR(32) NOT NULL,  -- 'CITIZEN_REGISTER' | 'CITIZEN_RESET'
    expires_at  TIMESTAMPTZ NOT NULL,
    used_at     TIMESTAMPTZ,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);
```

### `core.users` — Additional Columns Needed

```sql
ALTER TABLE core.users
    ADD COLUMN status VARCHAR(32) NOT NULL DEFAULT 'PENDING_SETUP',
    -- 'PENDING_SETUP' | 'ACTIVE' | 'SUSPENDED' | 'DEACTIVATED'
    ADD COLUMN agency VARCHAR(64),
    ADD COLUMN phone VARCHAR(20),
    ADD COLUMN provisioned_by UUID REFERENCES core.users(id);
    -- audit trail: which admin created this account
```

---

## 10. API Endpoints Required

### Official Provisioning (Protected — ICT_ADMIN or MINISTRY_ADMIN only)

```
POST   /api/admin/officials/provision     Create PENDING official account, send setup email
GET    /api/admin/officials               List officials (scoped by caller's agency)
PATCH  /api/admin/officials/:id/suspend   Suspend an account
PATCH  /api/admin/officials/:id/reactivate
```

### Account Setup (Public — token-gated)

```
GET    /api/auth/setup?token=<uuid>       Validate token, return name + role for display
POST   /api/auth/setup                    Submit password, activate account
```

### Citizen Registration (Public)

```
POST   /api/auth/citizen/verify-identity  Validate Citizen ID + phone, send OTP
POST   /api/auth/citizen/verify-otp       Validate OTP
POST   /api/auth/citizen/set-password     Create core.users record, return session
```

### Password Reset

```
POST   /api/auth/reset-request            Official: send reset link to work email
                                          Citizen: send OTP to phone on record
POST   /api/auth/reset-confirm            Official: token + new password
POST   /api/auth/citizen/reset-confirm    Citizen: OTP + new password
```

---

## 11. What Is Deferred (Not Built in Prototype)

The following are documented as production requirements but not implemented:

- **2FA / TOTP** — Phone number is collected at provisioning for future 2FA implementation
- **SSO / SAML integration** — For future integration with actual government directory services
- **Account deactivation cascade** — Suspending an official should invalidate all their active sessions immediately. Session store integration needed.
- **Real SMS gateway** — Replaced by Mailtrap email OTP in prototype
- **Hardware Security Module integration** — For ministry encryption keys per Section 6 of the executive document
- **Audit notifications to Ministry Admin** — When an officer account is accessed or suspended, Ministry Admin should receive a notification

---

*This document covers account creation, role structure, UI layout decisions, email delivery strategy, and verification flows as agreed. It does not cover citizen portal features, the three-tier data model implementation, or inter-agency data exchange — those are covered in the main executive reference document.*

