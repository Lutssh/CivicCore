# CivicCore — National Identity & Data Exchange Platform

CivicCore is a prototype national identity and data exchange platform for the fictional Republic of Kavali. It demonstrates a secure, controlled mechanism for government institutions to exchange citizen data using a unified 12-character lifelong identifier.

## Core Features

- **Unified Identity:** Unique Citizen ID generation with entropy and checksums.
- **Inter-Sector Protocol:** Secure, encrypted, and signed data exchange between government services.
- **Immutable Audit Log:** A permanent, append-only record of every access to citizen data.
- **Role-Based Access Control:** Strict data isolation between different government sectors (Education, Revenue, Labour, etc.).
- **Citizen Transparency:** A portal for citizens to view their own records and audit logs.

## Components

- **Backend:** Rust (Axum) API with PostgreSQL.
- **Mock Health Service:** A simulated external service for cryptographic protocol demonstration.
- **Frontends:** Seven React TypeScript applications (Civil Registry, Education, Revenue, Labour, Citizen, Verify, Admin).
- **Proxy Server:** Node.js server for subdomain routing and local development.

## Documentation

- [How to Run](./HOW_TO_RUN.md) — Setup and execution instructions.
# CivicCore
