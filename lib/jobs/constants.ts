// Imported by the write path, which must not pull pg-boss in.
export const EXTRACT_DEBOUNCE_SECONDS = 10

// Background extraction has nobody waiting on it, and a local model answering
// for the first time also has to be loaded. The client's 10 s default assumes
// a hosted API; this one assumes a homelab.
export const EXTRACT_TIMEOUT_MS = 180_000
