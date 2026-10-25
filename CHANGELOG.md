# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.1] - 2026-10-25

Review pass on 0.1.0, plus the theme system the UI was waiting for.

### Added

- Rimfrost tokens vendored from upstream, with eight themes (`nordlys` default,
  plus `fjord`, `ravn` and `skumring`, each in dark and light) and semantic
  aliases (`--bg`, `--fg`, `--border`, `--accent`, …) so pages never name a
  palette colour.
- Theme resolved from a cookie in the root layout, so there is no flash on
  load; a switcher on every page writes it back and updates `theme-color`.
- `/health` and `/api/v1/health` as aliases of `/api/health`.

### Fixed

- Paths are validated instead of rewritten: `café`, `caf!`, whitespace-only
  input and `.` segments are rejected with `invalid_path` naming the offending
  character, rather than silently colliding with another memory.
- `path_prefix` matching is literal, so an underscore no longer acts as a SQL
  wildcard and a prefix equal to an exact path now matches that memory.
- One input contract for MCP and REST: empty bodies and unknown `kind` values
  are rejected by both, and `body_too_large` no longer reports itself as a path
  error.
- A failed audit write logs a readable reason instead of a redacted one.
- The anonymous health check queries the database, so a dead database reports
  503 instead of `ok`.
- Login spends the same time on an unknown email as on a wrong password.
- Listing a project's grants requires `write`, so a read-only grantee cannot
  enumerate the other grantees.
- MCP `initialize` answers with the protocol version Mimir implements rather
  than echoing the client's claim.
- The landing-page test renders the page; the unused `otpauth` dependency is
  gone.
- README states what 0.1.1 actually does, and the quick start names the two
  database passwords the compose stack requires.

## [0.1.0] - 2026-10-25

First usable slice: Mimir boots from one container, authenticates a user, and
stores and retrieves project memory over MCP and REST.

### Fixed (review pass)

- REST calls now write one audit row each, the same as MCP calls.
- A memory body or title containing a NUL byte is refused with `invalid_params` instead of surfacing a Postgres error.
- MCP never forwards an unrecognised error code; anything outside the documented set becomes `internal`.
- `X-Forwarded-For` is read right to left, so a client-supplied first hop cannot spoof the audited IP or the rate-limit bucket.
- The session digest renders a top-level memory path whole instead of slicing off its first characters.
- Requests declaring more than 1 MB are rejected before the body is parsed.
- The app header links to Settings, so the first-run path to an API key is reachable.

### Added

- Repository scaffold: Next.js 16 (App Router, TypeScript strict), Tailwind v4, Vitest.
- Fail-fast configuration: `MIMIR_SECRET` is required and never generated.
- AES-256-GCM encryption helpers and secret redaction.
- Postgres schema with row-level security and two database roles (`mimir_owner`, `mimir_app`).
- Locked, idempotent migrations that run at boot.
- Transaction helper that sets `mimir.user_id` per request and cannot leak between pooled connections.
- Append-only audit log, one row per MCP or REST call.
- argon2id passwords, hashed session cookies, login rate limiting, and trusted-proxy aware client IPs.
- Bootstrap admin created from environment variables, once, on an empty install.
- API keys for agents: shown once, hashed at rest, revocable, with a small settings page.
- Projects resolved from a normalised git remote, so two agents in one repo share one project.
- Project grants with `read` and `write` roles. Admins do not implicitly see other users' memory.
- Path-based memory with progressive detail (title, summary, body), virtual directories, 256 KB body cap, and soft delete.
- Keyword retrieval with `websearch_to_tsquery`, path-prefix scoping, and reciprocal rank fusion.
- Session digest: an 800-token, grouped summary an agent can inject at session start.
- MCP endpoint at `POST /mcp` (JSON-RPC 2.0, stateless) with seven tools.
- REST API at `/api/v1` mirroring the MCP tools, and a split `/api/health`.
- Multi-stage Dockerfile (amd64 + arm64), compose file, and a tag-driven release workflow.
