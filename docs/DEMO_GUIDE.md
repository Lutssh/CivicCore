# CivicCore — Demo Guide

This guide walks you through a complete demo scenario showing the full lifecycle of a citizen in the Kavali CivicCore platform.

## Prerequisites
Ensure the system is running as per [HOW_TO_RUN.md](../HOW_TO_RUN.md).

## Demo Scenario: The Lifecycle of a Citizen

### 1. Registration
1.  Open **Civil Registry Portal** (`http://civil-registry.civiccore.demo`).
2.  Log in as `registrar@civiccore.demo` / `Demo@2026`.
3.  Click "Register New Birth".
4.  Fill in details for a new citizen (e.g., "John Doe", Male, 2026).
5.  Submit and note the generated **Citizen ID** (e.g., `CM26....`).

### 2. Education Enrollment
1.  Open **Education Portal** (`http://education.civiccore.demo`).
2.  Log in as `education@civiccore.demo` / `Demo@2026`.
3.  Search for the new Citizen ID.
4.  Enroll them in an institution (e.g., "Kavali National University").
5.  Record an exam result.

### 3. Revenue Registration
1.  Open **Revenue Portal** (`http://revenue.civiccore.demo`).
2.  Log in as `revenue@civiccore.demo` / `Demo@2026`.
3.  Search for the Citizen ID and register them as a taxpayer.
4.  Observe the generated **TIN**.

### 4. Labour Employment
1.  Open **Labour Portal** (`http://labour.civiccore.demo`).
2.  Log in as `labour@civiccore.demo` / `Demo@2026`.
3.  Register a new employment contract for the citizen.

### 5. Citizen Self-Service
1.  Open **Citizen Portal** (`http://citizen.civiccore.demo`).
2.  Log in with the Citizen ID and `Demo@2026`.
3.  View the consolidated record showing Education, Revenue, and Labour data.
4.  Check the **Audit Log** to see who has accessed your data.

### 6. Border Clearance (Security Demo)
1.  Open **Verification Terminal** (`http://verify.civiccore.demo`).
2.  Log in as `border@civiccore.demo` / `Demo@2026`.
3.  Run a clearance query for the citizen.
4.  Observe the successful clearance based on cross-sector data.
5.  *Optional:* Change the **Mock Health Service** mode to `FLAGGED` or `INVALID_SIGNATURE` to see the protocol's security in action.

### 7. Administration
1.  Open **Admin Console** (`http://admin.civiccore.demo`).
2.  Log in as `admin@civiccore.demo` / `Demo@2026`.
3.  View the global **System Audit Log**.
4.  Check **Sector Health** to see the status of external services.
5.  Provision a new official account.

### 8. Death & Cascade (Finality)
1.  Return to **Civil Registry Portal**.
2.  Search for the citizen and click "Register Death".
3.  Submit the death record.
4.  Observe the **Death Cascade**: the citizen's labour records are automatically closed, and tax account suspended.
5.  Verify the updated status in the **Admin Console** or **Verify Portal**.
