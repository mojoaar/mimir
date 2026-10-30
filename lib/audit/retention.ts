/**
 * How long the audit log keeps its rows. Memory traffic is the bulk of it, so
 * reads age out sooner; the auth and admin trail keeps a year.
 *
 * They live here rather than beside the prune job so a page can quote them
 * without importing a module that registers a worker on import.
 */
export const AUDIT_READ_RETENTION_DAYS = 30
export const AUDIT_RETENTION_DAYS = 365

/** A failed sign-in is noise once it is a month old, and an attacker sets the volume. */
export const AUDIT_FAILED_RETENTION_DAYS = 30
