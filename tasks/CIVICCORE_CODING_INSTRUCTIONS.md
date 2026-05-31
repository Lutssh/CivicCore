# CivicCore — Coding Assistant Implementation Guide

> **Purpose:** Precise, file-level instructions for applying all known bugs and design gaps to the CivicCore codebase. Each section names the exact file, the exact problem, and the exact code to write. Work through bugs in order — some are interdependent.

---

## Codebase Map (Quick Reference)

```
CivicCore/
├── backend/src/
│   ├── main.rs                        # Axum server entry point
│   ├── api/
│   │   ├── mod.rs                     # Router wiring — public vs auth-gated
│   │   ├── auth.rs                    # login / logout / me  (NO register endpoint yet)
│   │   ├── citizens.rs                # register, get_citizen, register_death, validate_id
│   │   ├── admin.rs                   # dashboard, audit, users, sectors
│   │   └── disputes.rs, verify.rs, education.rs, revenue.rs, labour.rs, audit.rs
│   ├── models/mod.rs                  # SQLx FromRow structs (User, Citizen, AuditEntry…)
│   ├── middleware/auth.rs             # Token → AuthContext extractor
│   ├── crypto/citizen_id.rs           # generate_citizen_id / validate_citizen_id
│   └── db/migrations/
│       ├── 20260525000001_core_tables.sql     # citizens, users, sessions, sequence_counter
│       └── 20260525000003_audit_and_crypto_tables.sql
├── frontends/
│   ├── civil-registry/src/App.tsx     # Registrar portal (React)
│   ├── admin/src/App.tsx              # Admin portal (React)
│   └── citizen/src/App.tsx            # Citizen self-service portal (React)
└── scripts/seed.py                    # Python seeding script
```

**Role strings in the system (exactly as stored in DB):**
`CIVIL_REGISTRAR` · `EDUCATION_OFFICER` · `REVENUE_OFFICER` · `LABOUR_OFFICER` · `CITIZEN` · `BORDER_OFFICER` · `SYSTEM_ADMIN`

---

## Bug 1 — Civil Registry Dashboard: Hardcoded "Total Citizens: 6"

### Problem
`frontends/civil-registry/src/App.tsx` — the `Dashboard` component contains a hardcoded string. It never reflects real data.

```tsx
// CURRENT (wrong) — around line 128
const Dashboard = () => (
  <div>
    <h1>Civil Registry Dashboard</h1>
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
      <div className="card">
        <div className="card-header">System Status</div>
        <div>Total Citizens: 6</div>          {/* ← hardcoded */}
        <div>Registrations today: 0</div>     {/* ← hardcoded */}
      </div>
```

### Root cause
The admin dashboard (`/api/admin/dashboard`) already runs `SELECT COUNT(*) FROM core.citizens` but that endpoint is SYSTEM_ADMIN-only. The civil registry dashboard makes no API call at all.

### Fix — Part A: New backend endpoint

**File:** `backend/src/api/citizens.rs`

Add this handler and wire it into the router:

```rust
// Add to the router function at the top of citizens.rs
pub fn router(pool: PgPool) -> Router {
    Router::new()
        .route("/register", post(register))
        .route("/stats", get(get_stats))          // ← ADD THIS LINE
        .route("/:citizen_id", get(get_citizen))
        .route("/:citizen_id/death", post(register_death))
        .route("/:citizen_id/audit", get(get_citizen_audit))
        .route("/validate-id", post(validate_id))
        .with_state(pool)
}

// Add this handler function anywhere in citizens.rs
async fn get_stats(
    State(pool): State<PgPool>,
    Extension(auth): Extension<AuthContext>,
) -> Json<CitizenResponse> {
    if auth.user.role != "CIVIL_REGISTRAR" && auth.user.role != "SYSTEM_ADMIN" {
        return Json(CitizenResponse {
            success: false,
            data: None,
            error: Some("Unauthorized".into()),
        });
    }

    let total: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM core.citizens")
        .fetch_one(&pool)
        .await
        .unwrap_or((0,));

    let today: (i64,) = sqlx::query_as(
        "SELECT COUNT(*) FROM core.citizens WHERE registered_at >= CURRENT_DATE"
    )
    .fetch_one(&pool)
    .await
    .unwrap_or((0,));

    Json(CitizenResponse {
        success: true,
        data: Some(serde_json::json!({
            "total_citizens": total.0,
            "registrations_today": today.0
        })),
        error: None,
    })
}
```

Add the `get` import if not already present at the top of `citizens.rs`:
```rust
use axum::routing::{post, get};   // get is already there from get_citizen
```

### Fix — Part B: Frontend fetches live data

**File:** `frontends/civil-registry/src/App.tsx`

Replace the static `Dashboard` component entirely:

```tsx
const Dashboard = () => {
  const { auth } = useAuth();
  const [stats, setStats] = useState<{ total_citizens: number; registrations_today: number } | null>(null);

  useEffect(() => {
    fetch(`${API_URL}/citizens/stats`, {
      headers: { 'Authorization': `Bearer ${auth?.token}` }
    })
      .then(r => r.json())
      .then(d => { if (d.success) setStats(d.data); });
  }, [auth]);

  return (
    <div>
      <h1>Civil Registry Dashboard</h1>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <div className="card">
          <div className="card-header">System Status</div>
          <div>Total Citizens: <strong>{stats?.total_citizens ?? '...'}</strong></div>
          <div>Registrations today: <strong>{stats?.registrations_today ?? '...'}</strong></div>
        </div>
        <div className="card">
          <div className="card-header">Quick Actions</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <Link to="/register-birth"><button>Register New Birth</button></Link>
          </div>
        </div>
      </div>
    </div>
  );
};
```

Add `useEffect` to the imports at the top of the file if not already imported:
```tsx
import React, { useState, useEffect, createContext, useContext } from 'react';
```

---

## Bug 2 — Birth Form: Full DOB Required, Only Year Stored + Hash

### Problem
The schema has `year_of_birth SMALLINT` and `date_of_birth_hash VARCHAR(64)` columns. The intent (per design doc) is to collect the full DOB from the registrar, store only the year in Tier 1, and store a SHA-256 hash of the full date. Currently:
- The form only shows a "Year of Birth" number input — no day or month
- The backend `RegisterRequest` struct only accepts `year_of_birth: u16`
- `date_of_birth_hash` is never populated

### Fix — Part A: Backend struct and INSERT

**File:** `backend/src/api/citizens.rs`

Add `sha2` dependency use (already in Cargo.toml via the auth module — confirm with `grep sha2 backend/Cargo.toml`). If missing, add `sha2 = "0.10"` to `[dependencies]` in `backend/Cargo.toml`.

Modify `RegisterRequest`:

```rust
// REPLACE the existing RegisterRequest struct
#[derive(Deserialize)]
pub struct RegisterRequest {
    pub full_name: String,
    pub sex: char,
    pub year_of_birth: u16,
    pub month_of_birth: u8,     // ← ADD: 1–12
    pub day_of_birth: u8,       // ← ADD: 1–31
    pub district_of_birth: String,
    pub place_of_birth: Option<String>,
    pub father_citizen_id: Option<String>,
    pub mother_citizen_id: Option<String>,
    pub spouse_citizen_id: Option<String>,
}
```

Add the hash computation and updated INSERT inside the `register` handler, replacing the existing INSERT block (step 3):

```rust
// At the top of the register function, add hash computation after sex is validated:
use sha2::{Digest, Sha256};

// Validate month/day range
if payload.month_of_birth < 1 || payload.month_of_birth > 12 {
    return Json(CitizenResponse { success: false, data: None, error: Some("Invalid month".into()) });
}
if payload.day_of_birth < 1 || payload.day_of_birth > 31 {
    return Json(CitizenResponse { success: false, data: None, error: Some("Invalid day".into()) });
}

// Compute DOB hash — format as YYYY-MM-DD before hashing
let dob_string = format!(
    "{:04}-{:02}-{:02}",
    payload.year_of_birth, payload.month_of_birth, payload.day_of_birth
);
let dob_hash = format!("{:x}", Sha256::digest(dob_string.as_bytes()));

// REPLACE the existing INSERT query (step 3) with:
let res = sqlx::query(
    "INSERT INTO core.citizens (citizen_id, full_name, sex, year_of_birth, date_of_birth_hash,
     district_of_birth, place_of_birth, father_citizen_id, mother_citizen_id,
     spouse_citizen_id, registered_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING id"
)
.bind(&citizen_id)
.bind(&payload.full_name)
.bind(payload.sex.to_string())
.bind(payload.year_of_birth as i16)
.bind(&dob_hash)                    // ← NEW binding
.bind(&payload.district_of_birth)
.bind(&payload.place_of_birth)
.bind(&payload.father_citizen_id)
.bind(&payload.mother_citizen_id)
.bind(&payload.spouse_citizen_id)
.bind(auth.user.id)
.fetch_one(&mut *tx)
.await;
```

You will also need to add `use sha2::{Digest, Sha256};` at the top of `citizens.rs` (import block).

### Fix — Part B: Frontend form adds day + month inputs

**File:** `frontends/civil-registry/src/App.tsx`

Update the form state initialization and the DOB section of `BirthRegistration`:

```tsx
// REPLACE the useState initialization for the form
const [form, setForm] = useState({
  full_name: '',
  sex: 'M',
  year_of_birth: new Date().getFullYear(),
  month_of_birth: 1,     // ← ADD
  day_of_birth: 1,       // ← ADD
  district_of_birth: 'Kampala',
  place_of_birth: '',
  father_citizen_id: '',
  mother_citizen_id: '',
});
```

Replace the single "Year of Birth" form group with a three-part DOB row:

```tsx
{/* REPLACE the existing single year-of-birth form-group with: */}
<div style={{ display: 'flex', gap: 16 }}>
  <div className="form-group" style={{ flex: 1 }}>
    <label>Day <span className="required">*</span></label>
    <input
      type="number" min={1} max={31}
      value={form.day_of_birth}
      onChange={e => setForm({ ...form, day_of_birth: parseInt(e.target.value) })}
      required
    />
  </div>
  <div className="form-group" style={{ flex: 1 }}>
    <label>Month <span className="required">*</span></label>
    <select value={form.month_of_birth} onChange={e => setForm({ ...form, month_of_birth: parseInt(e.target.value) })} required>
      {['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'].map((m, i) => (
        <option key={i+1} value={i+1}>{m}</option>
      ))}
    </select>
  </div>
  <div className="form-group" style={{ flex: 1 }}>
    <label>Year <span className="required">*</span></label>
    <input
      type="number" min={1900} max={new Date().getFullYear()}
      value={form.year_of_birth}
      onChange={e => setForm({ ...form, year_of_birth: parseInt(e.target.value) })}
      required
    />
  </div>
</div>
```

---

## Bug 3 — full_name Field: Design Decision (No Code Change Required)

### Status: Not a bug — intentional single-field design

The DB schema (`20260525000001_core_tables.sql`) has only `full_name VARCHAR(255)`. There are no `given_name` or `surname` columns. This is consistent throughout the backend struct (`RegisterRequest.full_name`), the frontend form, and the seed data. **Do not add separate columns unless explicitly asked to change the data model.** Document this as a known design choice if asked.

---

## Bug 4 — "Failed to create citizen record" with No Diagnostic Detail

Two separate problems, two separate fixes.

### Problem A: Error is swallowed

**File:** `backend/src/api/citizens.rs`

Find this block in the `register` handler (currently after the INSERT):

```rust
// CURRENT (wrong)
if res.is_err() {
    return Json(CitizenResponse { success: false, data: None, error: Some("Failed to create citizen record".into()) });
}
```

Replace it with a match that surfaces the actual database error:

```rust
// REPLACEMENT
let _citizen_row = match res {
    Ok(row) => row,
    Err(e) => {
        // Log the real error to stderr so it appears in server logs
        tracing::error!("Failed to insert citizen: {:?}", e);
        let msg = if e.to_string().contains("foreign key") {
            "Invalid parent ID — no citizen exists with that ID".to_string()
        } else if e.to_string().contains("unique") {
            "A citizen with this ID already exists".to_string()
        } else {
            format!("Database error: {}", e)
        };
        return Json(CitizenResponse { success: false, data: None, error: Some(msg) });
    }
};
```

### Problem B: Empty string `""` sent as parent ID instead of `null`

**File:** `frontends/civil-registry/src/App.tsx`

In the `handleSubmit` function inside `BirthRegistration`, convert empty parent ID strings to `null` before sending:

```tsx
const handleSubmit = async (e: React.FormEvent) => {
  e.preventDefault();
  setError('');
  try {
    // Normalize empty strings to null for optional ID fields
    const payload = {
      ...form,
      father_citizen_id: form.father_citizen_id.trim() || null,
      mother_citizen_id: form.mother_citizen_id.trim() || null,
    };

    const resp = await fetch(`${API_URL}/citizens/register`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${auth?.token}`
      },
      body: JSON.stringify(payload),   // ← use payload, not form
    });
    const data = await resp.json();
    if (data.success) {
      setSuccess(data.data);
    } else {
      setError(data.error);
    }
  } catch (err) {
    setError('Submission failed');
  }
};
```

**File:** `backend/src/api/citizens.rs`

Additionally guard on the backend — treat `Some("")` as `None` before SQL binding:

```rust
// Add this helper just before or inside the register function:
fn empty_to_none(s: Option<String>) -> Option<String> {
    s.filter(|v| !v.trim().is_empty())
}

// Then in the register handler, when binding parent IDs:
.bind(empty_to_none(payload.father_citizen_id.clone()))
.bind(empty_to_none(payload.mother_citizen_id.clone()))
.bind(empty_to_none(payload.spouse_citizen_id.clone()))
```

---

## Bug 5 — New Citizens Don't Appear in User Management

### Problem
`core.citizens` (civil records) and `core.users` (portal login accounts) are separate tables. The admin User Management page only queries `core.users`. Registering a birth creates a row in `core.citizens` only — no user account. So newly registered citizens are invisible to User Management by design, and there is no citizen-browsing UI at all.

### Fix — Add a Citizen Registry page to the admin portal

#### Part A: Backend — new endpoint `GET /api/admin/citizens`

**File:** `backend/src/api/admin.rs`

Add to the router:
```rust
pub fn router(pool: PgPool) -> Router {
    Router::new()
        .route("/dashboard", get(get_dashboard))
        .route("/audit", get(get_audit))
        .route("/users", get(get_users))
        .route("/sectors", get(get_sectors))
        .route("/citizens", get(get_citizens))   // ← ADD THIS
        .with_state(pool)
}
```

Add the handler:
```rust
async fn get_citizens(
    State(pool): State<PgPool>,
    Extension(auth): Extension<AuthContext>,
) -> Json<serde_json::Value> {
    if auth.user.role != "SYSTEM_ADMIN" {
        return Json(serde_json::json!({ "success": false, "error": "Unauthorized" }));
    }

    let citizens = sqlx::query(
        "SELECT citizen_id, full_name, sex, year_of_birth, district_of_birth,
                nationality, status, registered_at
         FROM core.citizens
         ORDER BY registered_at DESC
         LIMIT 200"
    )
    .fetch_all(&pool)
    .await
    .unwrap_or_default();

    let list: Vec<serde_json::Value> = citizens.iter().map(|row| {
        use sqlx::Row;
        serde_json::json!({
            "citizen_id":       row.get::<String, _>("citizen_id"),
            "full_name":        row.get::<String, _>("full_name"),
            "sex":              row.get::<String, _>("sex"),
            "year_of_birth":    row.get::<i16, _>("year_of_birth"),
            "district":         row.get::<String, _>("district_of_birth"),
            "nationality":      row.get::<String, _>("nationality"),
            "status":           row.get::<String, _>("status"),
            "registered_at":    row.get::<chrono::DateTime<chrono::Utc>, _>("registered_at"),
        })
    }).collect();

    Json(serde_json::json!({ "success": true, "data": list }))
}
```

#### Part B: Frontend — add Citizens page and sidebar link

**File:** `frontends/admin/src/App.tsx`

Add to the sidebar `<div className="sidebar-nav">` block:
```tsx
<Link to="/citizens">Citizen Registry</Link>   {/* ← ADD after Dashboard link */}
```

Add the new page component (place alongside the other page components):
```tsx
const CitizenRegistry = () => {
  const { auth } = useAuth();
  const [citizens, setCitizens] = useState<any[]>([]);

  useEffect(() => {
    fetch(`${API_URL}/admin/citizens`, {
      headers: { 'Authorization': `Bearer ${auth?.token}` }
    })
      .then(r => r.json())
      .then(d => { if (d.success) setCitizens(d.data); });
  }, [auth]);

  return (
    <div>
      <h1>Citizen Registry</h1>
      <p>Civil records in <code>core.citizens</code>. Separate from portal user accounts.</p>
      <div className="card" style={{ padding: 0 }}>
        <table>
          <thead>
            <tr>
              <th>Citizen ID</th>
              <th>Full Name</th>
              <th>Sex</th>
              <th>Year of Birth</th>
              <th>District</th>
              <th>Status</th>
              <th>Registered</th>
            </tr>
          </thead>
          <tbody>
            {citizens.length === 0 ? (
              <tr><td colSpan={7} style={{ textAlign: 'center' }}>No citizens found</td></tr>
            ) : (
              citizens.map((c: any) => (
                <tr key={c.citizen_id}>
                  <td className="monospace">{c.citizen_id}</td>
                  <td><strong>{c.full_name}</strong></td>
                  <td>{c.sex === 'M' ? 'Male' : 'Female'}</td>
                  <td>{c.year_of_birth}</td>
                  <td>{c.district}</td>
                  <td>
                    <span style={{ color: c.status === 'ACTIVE' ? 'green' : c.status === 'DECEASED' ? '#666' : 'red' }}>
                      {c.status}
                    </span>
                  </td>
                  <td>{new Date(c.registered_at).toLocaleDateString()}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
```

Add the route inside `<Routes>`:
```tsx
<Route path="/citizens" element={<ProtectedRoute><CitizenRegistry /></ProtectedRoute>} />
```

---

## Bug 6 — Citizens and Officials Mixed in User Management

### Problem
`get_users` in `backend/src/api/admin.rs` returns all rows from `core.users` with no role filter. James Ssali (`CITIZEN` role) appears in the same flat table as registrars and admins.

### Fix — Part A: Separate queries or tabs

The cleanest approach is a role filter in the frontend with a tab UI.

**File:** `frontends/admin/src/App.tsx`

Replace the `UserManagement` component with a version that has role tabs:

```tsx
const UserManagement = () => {
  const { auth } = useAuth();
  const [users, setUsers] = useState<any[]>([]);
  const [tab, setTab] = useState<'OFFICIALS' | 'CITIZENS'>('OFFICIALS');

  useEffect(() => {
    fetch(`${API_URL}/admin/users`, {
      headers: { 'Authorization': `Bearer ${auth?.token}` }
    })
      .then(r => r.json())
      .then(d => { if (d.success) setUsers(d.data); });
  }, [auth]);

  const OFFICIAL_ROLES = ['CIVIL_REGISTRAR', 'EDUCATION_OFFICER', 'REVENUE_OFFICER',
                          'LABOUR_OFFICER', 'BORDER_OFFICER', 'SYSTEM_ADMIN'];
  const officials = users.filter(u => OFFICIAL_ROLES.includes(u.role));
  const citizens  = users.filter(u => u.role === 'CITIZEN');
  const displayed = tab === 'OFFICIALS' ? officials : citizens;

  const tabStyle = (active: boolean) => ({
    padding: '8px 16px',
    cursor: 'pointer',
    borderBottom: active ? '2px solid var(--color-primary)' : '2px solid transparent',
    fontWeight: active ? 'bold' : 'normal',
    background: 'none',
    border: 'none',
    borderBottom: active ? '2px solid #4a6fa5' : '2px solid transparent',
  } as React.CSSProperties);

  return (
    <div>
      <h1>User Management</h1>
      <p>Portal login accounts (<code>core.users</code>). Does not include citizens without a portal account.</p>
      <div style={{ display: 'flex', gap: 0, marginBottom: 16, borderBottom: '1px solid #ddd' }}>
        <button style={tabStyle(tab === 'OFFICIALS')} onClick={() => setTab('OFFICIALS')}>
          Officials ({officials.length})
        </button>
        <button style={tabStyle(tab === 'CITIZENS')} onClick={() => setTab('CITIZENS')}>
          Citizen Accounts ({citizens.length})
        </button>
      </div>
      <div className="card" style={{ padding: 0 }}>
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Email / Citizen ID</th>
              <th>Role</th>
              <th>Sector</th>
              <th>Status</th>
              <th>Last Login</th>
            </tr>
          </thead>
          <tbody>
            {displayed.map((u: any) => (
              <tr key={u.id}>
                <td><strong>{u.full_name}</strong></td>
                <td className="monospace" style={{ fontSize: 13 }}>{u.email}</td>
                <td className="monospace">{u.role}</td>
                <td>{u.sector || 'N/A'}</td>
                <td><span style={{ color: u.is_active ? 'green' : 'red' }}>{u.is_active ? 'Active' : 'Disabled'}</span></td>
                <td>{u.last_login_at ? new Date(u.last_login_at).toLocaleString() : 'Never'}</td>
              </tr>
            ))}
            {displayed.length === 0 && (
              <tr><td colSpan={6} style={{ textAlign: 'center' }}>No {tab.toLowerCase()} found</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
```

---

## Bug 7 — Register Death and Search Render Bare, Unstyled Stubs

### Problem
**File:** `frontends/civil-registry/src/App.tsx` — in the `<Routes>` block at the bottom of `App`:

```tsx
// CURRENT (wrong) — these bypass ProtectedRoute entirely
<Route path="/register-death" element={<div>Register Death Form (Stub)</div>} />
<Route path="/search" element={<div>Citizen Search (Stub)</div>} />
```

These render a bare unstyled `<div>` with no sidebar, no auth check, and no layout.

### Fix

**File:** `frontends/civil-registry/src/App.tsx`

Replace those two routes with ProtectedRoute-wrapped stubs that at least render inside the layout:

```tsx
// REPLACEMENT
<Route path="/register-death" element={
  <ProtectedRoute>
    <div>
      <h1>Register Death</h1>
      <div className="card">
        <p style={{ color: '#888' }}>Death registration form — not yet implemented.</p>
        <p>The backend endpoint <code>POST /api/citizens/:citizen_id/death</code> is ready.</p>
      </div>
    </div>
  </ProtectedRoute>
} />
<Route path="/search" element={
  <ProtectedRoute>
    <div>
      <h1>Search Citizens</h1>
      <div className="card">
        <p style={{ color: '#888' }}>Citizen search — not yet implemented.</p>
      </div>
    </div>
  </ProtectedRoute>
} />
```

> **Note for future implementation:** The death form should POST to `/api/citizens/:citizen_id/death` with fields `date_of_death`, `place_of_death`, `cause_of_death`, `informant_name`, `informant_relationship`. The backend handler already exists in `citizens.rs`.

---

## Bug 8 — Citizen Portal Login Fails (Wrong Hardcoded ID)

### Problem
**File:** `frontends/citizen/src/App.tsx` — the `LoginPage` component uses a hardcoded default placeholder:

```tsx
const [id, setId] = useState('CM850001AXMR');   // ← WRONG — never matches
```

The actual citizen ID generated for James Ssali (`sex='M'`, `year=1985`, `sequence=1`) by `seed.py` is **`CM850001AJR6`** — confirmed by running the seed algorithm directly:

```
seed.py:  generate_citizen_id('M', 1985, 1)  →  CM850001AJR6
frontend: placeholder                        →  CM850001AXMR  (WRONG)
```

### Fix

**File:** `frontends/citizen/src/App.tsx`

```tsx
// REPLACE
const [id, setId] = useState('CM850001AXMR');

// WITH
const [id, setId] = useState('CM850001AJR6');
```

### All seeded citizen IDs (for reference and testing)

| Name | Sex | Year | Seq | Citizen ID |
|---|---|---|---|---|
| James Ssali | M | 1985 | 1 | `CM850001AJR6` |
| Grace Nakato | F | 1995 | 42 | `CF950042H55L` |
| Solomon Okello | M | 1960 | 3 | `CM6000032ACV` |
| Pierre Dubois | M | 1990 | 4 | `CM900004XVEE` |
| Thomas Ssali | M | 2020 | 2 | `CM2000024R98` |

James Ssali is the only citizen with a `core.users` account (seeded by `seed.py`). His login credentials are `CM850001AJR6` / `Demo@2026`.

---

## Bug 9 — No Account Creation Flow Anywhere

### Problem
`backend/src/api/auth.rs` — the `public_router` only exposes `/login`. There is no `/register` for citizens and no provisioning endpoint for officials. From the design doc:

- **Citizens** self-register by proving their civil record exists (Citizen ID + phone → OTP → set password)
- **Officials** are provisioned by admins (admin creates PENDING account → work email setup link)

These are two entirely separate flows.

### Implementation Plan (Citizen Self-Registration — Phase 1)

Per the design doc (Section 6), the full flow requires OTP via Mailtrap. The minimum viable version for the prototype is a 3-step flow. Below is the implementation:

#### Step 1: Add DB tables

**File:** Create `backend/src/db/migrations/20260530000001_auth_flows.sql`

```sql
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
```

> **Run this migration** before any new auth endpoints will work.

#### Step 2: New auth endpoints

**File:** `backend/src/api/auth.rs`

Add these three endpoints to `public_router`:

```rust
pub fn public_router(pool: PgPool) -> Router {
    Router::new()
        .route("/login", post(login))
        .route("/citizen/verify-identity", post(citizen_verify_identity))  // ← ADD
        .route("/citizen/verify-otp", post(citizen_verify_otp))            // ← ADD
        .route("/citizen/set-password", post(citizen_set_password))        // ← ADD
        .with_state(pool)
}
```

Add these request/response structs and handler functions:

```rust
// ─── Citizen Self-Registration ────────────────────────────────────────────────

#[derive(Deserialize)]
pub struct CitizenVerifyIdentityRequest {
    pub citizen_id: String,
    pub phone: String,     // must match core.citizens record (future: full phone match)
}

async fn citizen_verify_identity(
    State(pool): State<PgPool>,
    Json(payload): Json<CitizenVerifyIdentityRequest>,
) -> Json<AuthResponse> {
    // 1. Citizen ID must exist in core.citizens
    let citizen = sqlx::query(
        "SELECT citizen_id FROM core.citizens WHERE citizen_id = $1 AND status = 'ACTIVE'"
    )
    .bind(&payload.citizen_id)
    .fetch_optional(&pool)
    .await;

    if citizen.unwrap_or(None).is_none() {
        // Generic error — don't reveal which field failed
        return Json(AuthResponse {
            success: false,
            data: None,
            error: Some(AuthError {
                code: "IDENTITY_NOT_FOUND".into(),
                message: "Could not verify identity. Check your Citizen ID and phone number.".into(),
            }),
        });
    }

    // 2. Check no existing ACTIVE user account for this citizen_id
    let existing = sqlx::query(
        "SELECT id FROM core.users WHERE citizen_id = $1 AND is_active = true"
    )
    .bind(&payload.citizen_id)
    .fetch_optional(&pool)
    .await
    .unwrap_or(None);

    if existing.is_some() {
        return Json(AuthResponse {
            success: false,
            data: None,
            error: Some(AuthError {
                code: "ACCOUNT_EXISTS".into(),
                message: "A portal account already exists for this citizen. Please log in.".into(),
            }),
        });
    }

    // 3. Generate 6-digit OTP
    let otp_code = format!("{:06}", rand::random::<u32>() % 1_000_000);
    let expires_at = Utc::now() + Duration::minutes(10);

    // Delete any existing unused OTPs for this phone
    let _ = sqlx::query("DELETE FROM core.otp_codes WHERE phone = $1 AND used_at IS NULL")
        .bind(&payload.phone)
        .execute(&pool)
        .await;

    let _ = sqlx::query(
        "INSERT INTO core.otp_codes (phone, code, purpose, expires_at) VALUES ($1, $2, $3, $4)"
    )
    .bind(&payload.phone)
    .bind(&otp_code)
    .bind("CITIZEN_REGISTER")
    .bind(expires_at)
    .execute(&pool)
    .await;

    // 4. In prototype: log OTP to server console (Mailtrap integration is deferred)
    tracing::info!("OTP for {} (citizen {}): {}", payload.phone, payload.citizen_id, otp_code);

    Json(AuthResponse {
        success: true,
        data: None,
        error: None,
    })
}

// ─────────────────────────────────────────────────────────────────────────────

#[derive(Deserialize)]
pub struct CitizenVerifyOtpRequest {
    pub citizen_id: String,
    pub phone: String,
    pub otp: String,
}

async fn citizen_verify_otp(
    State(pool): State<PgPool>,
    Json(payload): Json<CitizenVerifyOtpRequest>,
) -> Json<AuthResponse> {
    let otp_row = sqlx::query(
        "SELECT id FROM core.otp_codes
         WHERE phone = $1 AND code = $2 AND purpose = 'CITIZEN_REGISTER'
               AND expires_at > NOW() AND used_at IS NULL"
    )
    .bind(&payload.phone)
    .bind(&payload.otp)
    .fetch_optional(&pool)
    .await
    .unwrap_or(None);

    if otp_row.is_none() {
        return Json(AuthResponse {
            success: false,
            data: None,
            error: Some(AuthError {
                code: "INVALID_OTP".into(),
                message: "Incorrect or expired code.".into(),
            }),
        });
    }

    // Mark OTP as used
    use sqlx::Row;
    let otp_id: Uuid = otp_row.unwrap().get("id");
    let _ = sqlx::query("UPDATE core.otp_codes SET used_at = NOW() WHERE id = $1")
        .bind(otp_id)
        .execute(&pool)
        .await;

    Json(AuthResponse { success: true, data: None, error: None })
}

// ─────────────────────────────────────────────────────────────────────────────

#[derive(Deserialize)]
pub struct CitizenSetPasswordRequest {
    pub citizen_id: String,
    pub phone: String,
    pub password: String,
}

async fn citizen_set_password(
    State(pool): State<PgPool>,
    Json(payload): Json<CitizenSetPasswordRequest>,
) -> Json<AuthResponse> {
    // Verify the OTP was recently completed (used_at within last 5 minutes)
    let verified = sqlx::query(
        "SELECT 1 FROM core.otp_codes
         WHERE phone = $1 AND purpose = 'CITIZEN_REGISTER'
               AND used_at IS NOT NULL AND used_at > NOW() - INTERVAL '5 minutes'"
    )
    .bind(&payload.phone)
    .fetch_optional(&pool)
    .await
    .unwrap_or(None);

    if verified.is_none() {
        return Json(AuthResponse {
            success: false,
            data: None,
            error: Some(AuthError {
                code: "OTP_NOT_VERIFIED".into(),
                message: "OTP verification required before setting password.".into(),
            }),
        });
    }

    // Validate password length
    if payload.password.len() < 8 {
        return Json(AuthResponse {
            success: false,
            data: None,
            error: Some(AuthError {
                code: "WEAK_PASSWORD".into(),
                message: "Password must be at least 8 characters.".into(),
            }),
        });
    }

    // Fetch citizen's full_name for the new user row
    let citizen = sqlx::query("SELECT full_name FROM core.citizens WHERE citizen_id = $1")
        .bind(&payload.citizen_id)
        .fetch_optional(&pool)
        .await
        .unwrap_or(None);

    let full_name: String = match citizen {
        Some(row) => { use sqlx::Row; row.get("full_name") },
        None => return Json(AuthResponse {
            success: false,
            data: None,
            error: Some(AuthError { code: "NOT_FOUND".into(), message: "Citizen not found.".into() }),
        }),
    };

    // Hash password
    use argon2::password_hash::{rand_core::OsRng, PasswordHasher, SaltString};
    use argon2::Argon2;
    let salt = SaltString::generate(&mut OsRng);
    let password_hash = Argon2::default()
        .hash_password(payload.password.as_bytes(), &salt)
        .map(|h| h.to_string())
        .unwrap_or_default();

    // Create user account
    let result = sqlx::query(
        "INSERT INTO core.users (email, password_hash, role, full_name, citizen_id, status)
         VALUES ($1, $2, 'CITIZEN', $3, $4, 'ACTIVE')
         ON CONFLICT (email) DO NOTHING"
    )
    .bind(&payload.citizen_id)     // citizen_id used as email (consistent with seed.py pattern)
    .bind(&password_hash)
    .bind(&full_name)
    .bind(&payload.citizen_id)
    .execute(&pool)
    .await;

    match result {
        Ok(r) if r.rows_affected() > 0 => Json(AuthResponse { success: true, data: None, error: None }),
        Ok(_) => Json(AuthResponse {
            success: false,
            data: None,
            error: Some(AuthError { code: "ACCOUNT_EXISTS".into(), message: "Account already exists.".into() }),
        }),
        Err(e) => {
            tracing::error!("Failed to create citizen user: {:?}", e);
            Json(AuthResponse {
                success: false,
                data: None,
                error: Some(AuthError { code: "INTERNAL_ERROR".into(), message: "Failed to create account.".into() }),
            })
        }
    }
}
```

**Additional imports needed at top of `auth.rs`:**
```rust
use rand;   // add `rand = "0.8"` to backend/Cargo.toml if not present
```

#### Step 3: Frontend registration flow

**File:** `frontends/citizen/src/App.tsx`

The `LoginPage` currently only has a login form. Add a "Create Account" link that leads to a 3-step registration wizard. Add a new `RegisterPage` component before `LoginPage`:

```tsx
const RegisterPage = () => {
  const navigate = useNavigate();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [citizenId, setCitizenId] = useState('');
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleVerifyIdentity = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(''); setLoading(true);
    const resp = await fetch(`${API_URL}/auth/citizen/verify-identity`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ citizen_id: citizenId, phone }),
    });
    const data = await resp.json();
    setLoading(false);
    if (data.success) setStep(2);
    else setError(data.error?.message || 'Verification failed');
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(''); setLoading(true);
    const resp = await fetch(`${API_URL}/auth/citizen/verify-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ citizen_id: citizenId, phone, otp }),
    });
    const data = await resp.json();
    setLoading(false);
    if (data.success) setStep(3);
    else setError(data.error?.message || 'Invalid code');
  };

  const handleSetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(''); setLoading(true);
    const resp = await fetch(`${API_URL}/auth/citizen/set-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ citizen_id: citizenId, phone, password }),
    });
    const data = await resp.json();
    setLoading(false);
    if (data.success) navigate('/login');
    else setError(data.error?.message || 'Failed to set password');
  };

  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
      <div className="card" style={{ width: 360 }}>
        <div className="card-header">Create Citizen Account — Step {step} of 3</div>
        {step === 1 && (
          <form onSubmit={handleVerifyIdentity}>
            <div className="form-group">
              <label>Citizen ID</label>
              <input className="monospace" value={citizenId} onChange={e => setCitizenId(e.target.value)} required placeholder="e.g. CM850001AJR6" />
            </div>
            <div className="form-group">
              <label>Phone Number on Record</label>
              <input value={phone} onChange={e => setPhone(e.target.value)} required placeholder="+256..." />
            </div>
            {error && <div style={{ color: 'red', marginBottom: 12 }}>{error}</div>}
            <button type="submit" style={{ width: '100%' }} disabled={loading}>
              {loading ? 'Verifying...' : 'Send Verification Code'}
            </button>
          </form>
        )}
        {step === 2 && (
          <form onSubmit={handleVerifyOtp}>
            <p style={{ fontSize: 13, color: '#555' }}>A 6-digit code was sent to {phone}. (Check server logs in prototype mode.)</p>
            <div className="form-group">
              <label>Verification Code</label>
              <input className="monospace" value={otp} onChange={e => setOtp(e.target.value)} required maxLength={6} placeholder="000000" />
            </div>
            {error && <div style={{ color: 'red', marginBottom: 12 }}>{error}</div>}
            <button type="submit" style={{ width: '100%' }} disabled={loading}>
              {loading ? 'Checking...' : 'Verify Code'}
            </button>
          </form>
        )}
        {step === 3 && (
          <form onSubmit={handleSetPassword}>
            <div className="form-group">
              <label>Set Password</label>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)} required minLength={8} />
            </div>
            {error && <div style={{ color: 'red', marginBottom: 12 }}>{error}</div>}
            <button type="submit" style={{ width: '100%' }} disabled={loading}>
              {loading ? 'Creating account...' : 'Create Account'}
            </button>
          </form>
        )}
        <div style={{ marginTop: 16, textAlign: 'center', fontSize: 13 }}>
          Already have an account? <a href="/login">Log in</a>
        </div>
      </div>
    </div>
  );
};
```

Add this route in the citizen `App` component `<Routes>` block:
```tsx
<Route path="/register" element={<RegisterPage />} />
```

Add a "Create Account" link to `LoginPage`:
```tsx
{/* Add inside the login form card, after the submit button */}
<div style={{ marginTop: 16, textAlign: 'center', fontSize: 13 }}>
  No account yet? <a href="/register">Create one</a>
</div>
```

---

## Dependency Checklist

Before compiling, verify `backend/Cargo.toml` includes:

| Crate | Purpose | Already Present? |
|---|---|---|
| `sha2` | DOB hashing (Bug 2), session tokens | ✅ Yes (used in auth.rs) |
| `argon2` | Password hashing | ✅ Yes |
| `rand` | OTP generation (Bug 9) | ❓ Check — add `rand = "0.8"` if missing |
| `tracing` | Error logging | ✅ Yes |
| `chrono` | Date/time | ✅ Yes |

---

## Migration Execution Order

Apply migrations in this order when resetting the dev database:

1. `20260525000001_core_tables.sql` — base schema
2. `20260525000003_audit_and_crypto_tables.sql` — audit + crypto
3. `20260530000001_auth_flows.sql` — NEW: OTP + setup tokens (Bug 9)
4. Run `python3 scripts/seed.py` — insert demo users and citizens

> **Re-seed after schema changes.** The `ON CONFLICT DO UPDATE/NOTHING` clauses in `seed.py` make it safe to re-run.

---

## Testing Checklist (End-to-End)

After all changes are applied:

| Test | Expected |
|---|---|
| Civil Registry Dashboard loads | Shows live counts from DB, not "6" |
| Register birth without parent IDs | Succeeds — null sent for empty fields |
| Register birth with invalid parent ID | Error message mentions "foreign key" or "no citizen with that ID" |
| Birth form sends month + day | `date_of_birth_hash` column populated in DB |
| Admin → Citizen Registry page | Lists all rows from `core.citizens` |
| Admin → User Management | Two tabs: Officials / Citizen Accounts |
| Civil Registry → Register Death | Opens inside layout with sidebar (not blank) |
| Civil Registry → Search | Opens inside layout with sidebar (not blank) |
| Citizen portal login with `CM850001AJR6` | Authenticates successfully |
| Citizen self-registration flow | Step 1 → OTP in server log → Step 2 → Step 3 → can log in |

