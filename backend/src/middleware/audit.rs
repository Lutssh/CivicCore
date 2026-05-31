// Audit middleware (production hook).
// In production this layer would automatically append an audit entry for
// every authenticated request, capturing actor, endpoint, timestamp, and IP.
// In this prototype, audit entries are written manually per handler via AuditWriter.
