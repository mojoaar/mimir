# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.6.0] - 2026-10-26

History you can undo.

### Added

- Every write keeps the body it replaced, so an agent that overwrites a memory
  no longer destroys what was there. The last 20 versions per memory are kept
  and pruned by the nightly purge job.
- A history panel in the memory browser: the versions of a memory, a line diff
  against what is live now, and a restore button. A restore is itself a write,
  so a mistaken restore can be undone the same way.
- `GET /api/v1/projects/:slug/memory/*path/versions` and
  `POST /api/v1/projects/:slug/versions/:id/restore`, so an agent can read and
  restore history too.
- `diff` as a dependency, for the line diff.

### Changed

- A wrong URL now gets a real 404 and a page worth reading instead of the
  framework's bare one. The theme cookie picks the colours and the line is
  stable per path.
- `runPurge` reports `{ removed, versionsRemoved }`, and the `memory.purge`
  audit row carries both counts.

## [0.5.0] - 2026-10-26

Seeing what the agents wrote.

### Added

- A memory browser at `/app/projects/<slug>`: the project's directory tree, a reader with the path, title, summary and body, search scoped to the project, and a deep link per memory (`?path=…`).
- Edit, delete and restore from the browser. A rewrite clears the summary until the learning job writes a new one; a delete is recoverable, and a nightly job purges anything older than 30 days.
- Project archiving: an owner can hide a project from every list and API call and restore it later, with its memories and grants intact.

### Fixed

- A URL that is not a page — an unknown locale, an unknown docs agent, any path with no route — answers a real `404` instead of `200` with a not-found body, and `/app/*` keeps its `noindex` header. A valid route with a missing id (a purged memory, a deleted project) still renders the not-found page with `200`, because Next streams a dynamic route's shell before the page can decide.
- An archived project refuses reads and writes through the API instead of failing with an internal error, and the zero-config repo lookup no longer dead-ends on the repo-key unique index.
- Editing a memory in the browser keeps its title, and a refused or impossible restore says why instead of landing silently.
- Archiving is owner-only in the UI: a write or read grantee no longer sees a Restore button that cannot work.


## [0.4.0] - 2026-10-26

Public surface: the parts a stranger meets first.

### Fixed (review pass)

- The marketing pages emit absolute canonical and `hreflang` URLs and a link-preview image; the docs no longer advertise Danish or German alternates that do not exist.
- An ingest batch over 1 MiB is accepted up to its documented 2 MB, and one oversized or malformed file refuses the whole batch instead of writing the rest.
- The OpenCode plugin reads the git remote under ESM, and its docs no longer claim a session-start digest it does not do.
- The OpenCode plugin gains a build and a guarded publish step in the release workflow, so the package can actually be installed.
- The login page is marked `noindex`.

### Added

- The marketing page is localised: English at `/`, Danish at `/da`, German at `/de`, with the reader's choice remembered.
- `sitemap.xml`, `robots.txt`, per-page canonical URLs, `hreflang` alternates and an Open Graph image, all built from the configured public URL.
- A public `/docs` site: self-hosting, backups, MCP, the REST API, every tool, how search works, and the changelog rendered from this file.
- One page per agent with the exact config file and a snippet that agent accepts: OpenCode, Claude Code, Codex, Cursor, Gemini CLI, Pi, Antigravity, Hermes, Muse.
- `memory_ingest` over MCP and `POST /api/v1/projects/:slug/ingest`, for loading an existing repository (100 files / 2 MB per batch).
- `@mojoaar/opencode-mimir`: an OpenCode plugin that registers `mimir_digest` and `mimir_remember`.
- A Claude Code session-start hook (`hooks/mimir-session-start.sh`) and `format=text` on the digest endpoint so a shell can use it.

### Changed

- Marketing paths are served through a `[locale]` segment; `/en/...` redirects to the unprefixed form so there is no duplicate page.

## [0.3.0] - 2026-10-25

Mimir can now be operated: it backs itself up, it manages its users, and an
admin can see what happened.

### Added

- Encrypted scheduled backups to S3 or WebDAV (pCloud included): two artifacts
  per run, a `pg_dump -Fc` of the database and a JSON export of settings,
  projects and provider labels. Every upload is read back and its size checked
  before the run is recorded as successful.
- Retention: the newest N runs are kept (14 by default) and older artifacts
  under the configured prefix are pruned; nothing outside that prefix is touched.
- A backup admin page: target and schedule form, `Run now`, last-success age,
  and the last 20 runs with their errors.
- `scripts/decrypt-backup.mjs` and an encrypted branch in `scripts/restore.sh`,
  so an uploaded `.enc` artifact restores without ever writing plaintext to disk.
- Admin user management: create, verify, enable, disable, change role, reset a
  password, reset MFA and delete. Disabling a user revokes their sessions and
  API keys in the same transaction.
- TOTP two-step login, optional per user, with a `require_mfa` install switch
  and a replay guard on the last accepted step. The bootstrap admin is exempt so
  a misconfigured install cannot lock its only operator out.
- An optional IP allowlist (CIDR blocks) enforced on `/api/v1`, `/mcp`, the
  login page and the product area. `/health` and the marketing page stay open.
- An audit viewer with filters, pagination and CSV export, plus a nightly prune
  that keeps memory traffic for 30 days and everything else for a year.
- An admin overview with user, project, memory, embedding and job counts.
- A site settings page for the public URL, site name, meta description,
  `require_mfa` and the allowlist.
- Invitation and password-reset links by email through Resend, falling back to a
  copyable one-time link when email is not configured.

### Changed

- PostgreSQL 18 (was 17). A pre-0.3.0 install must be dumped and restored; the image will not start on the old data directory.
- The runtime image installs `postgresql18-client`, because `pg_dump` refuses a
  server newer than itself and the backup job would fail at 3 a.m.
- `scripts/restore.sh` is POSIX `sh` so it runs inside the Alpine image.

### Fixed

- Encrypted settings and provider credentials are sealed as one blob, so a
  partially written settings row can no longer leave a secret in the clear.


### Fixed (review pass)

- Retention counts restore points, not files. It deleted every database dump once 14 runs existed, because `mimir-…` names sort before `settings-…` names, and then recorded the run `ok`.
- A failed backup now removes the objects it already uploaded, so a truncated dump cannot sit next to the good ones.
- Saving the backup form a second time no longer wipes the S3 access key id, and saving email settings without a key is refused instead of silently disabling email.
- The IP allowlist now covers server actions and route handlers, not just page renders, so a blocked network cannot mutate anything with an old cookie.
- Admin user actions no longer report "That did not work" after a successful change; `redirect()` was being caught as a failure.
- The audit CSV export returns up to 10,000 rows instead of being clamped to 200.
- A password reset action exists, and a user created without a password can be re-invited from the users page.
- The TOTP step is rate limited, and the replay guard is a single conditional write so two simultaneous submissions cannot both pass.
- An invalid cron expression is rejected when saved and can no longer stop the job queue from starting.
- Audit retention ages out reads at 30 days; writes and deletes are kept for a year.

## [0.2.0] - 2026-10-25

Mimir now learns. Memory is titled and summarised by your own model, and
search matches meaning as well as words.

### Added

- Background jobs on pg-boss, running inside the server process: an `extract`
  queue debounced per project, a `backfill` queue and a `reembed` queue.
- Provider presets for DeepSeek, OpenCode Go, OpenCode Console, Ollama and any
  OpenAI-compatible endpoint, with keys encrypted at rest and only a hint ever
  shown back.
- Provider management at **Settings → Providers**, with **Test connection**
  probing the endpoint and recording the outcome.
- Install-wide embedding model at **Admin → Settings**, with the dimension
  fixed at 768 and a rebuild action that nulls and refills every vector.
- Extraction writes a one-line title and a short summary for each memory,
  using the project owner's language model, and can be switched on per
  project at **Project → Settings**.
- Memory is embedded on write when an embedding model is configured, so
  search finds it by meaning; backfill fills in anything written before.
- Project list on the dashboard, and a project settings page with the
  learning toggle and a per-project provider override.

### Changed

- Retrieval is hybrid when an embedding model is configured: a keyword arm and
  a vector arm are fused with reciprocal rank fusion. Without one it is
  keyword-only, exactly as before.
- A write never fails because a provider is down, slow or misconfigured — the
  memory is stored either way, and search stays on keywords.

### Fixed (review pass)

- A provider that could not be resolved — an embedding provider whose key was
  encrypted under another `MIMIR_SECRET`, for example — failed the write
  instead of degrading to keyword search.
- A provider that answered with a full-length vector of non-numbers reached the
  `::vector` cast and failed the write.
- A write grantee could toggle learning on a project, be told "Saved.", and
  change nothing, because the row-level policy is owner-only. Project settings
  are now owner-only and say so.
- **Admin → Settings** probed the stored model but saved the typed one, so a
  typo could pass the dimension check and then leave every memory unembedded.
- Re-embedding could drop every vector and report success when the provider was
  unavailable; it now refuses to start without a provider and fails the job if
  rows are still empty afterwards.
- Extraction took the newest memories first, so a slow model starved older rows
  indefinitely; it now works oldest-first, fails the job on a provider error so
  the queue retries, and queues another batch when one fills.

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
  input, a whitespace-only segment (`deploy/ `) and `.` segments are rejected
  with `invalid_path` naming the offending character, rather than silently
  colliding with another memory.
- `path_prefix` matching is literal, so an underscore no longer acts as a SQL
  wildcard and a prefix equal to an exact path now matches that memory.
- One input contract for MCP and REST: empty bodies and unknown `kind` values
  are rejected by both, and `body_too_large` no longer reports itself as a path
  error.
- A failed audit write logs a readable reason instead of a redacted one.
- The anonymous health check queries the database, so a dead database reports
  503 instead of `ok`, and a caller holding a token gets the same 503 instead
  of an empty 500.
- Login spends the same time on an unknown email as on a wrong password.
- Listing a project's grants requires `write`, so a read-only grantee cannot
  enumerate the other grantees.
- MCP `initialize` answers with the protocol version Mimir implements rather
  than echoing the client's claim.
- The landing-page test renders the page; the unused `otpauth` dependency is
  gone.
- README states what 0.1.1 actually does, and the quick start names the two
  database passwords the compose stack requires.
- Tailwind's PostCSS plugin is configured and its stylesheet imported, so the
  utility classes the pages use are generated at all; before this, the themed
  markup shipped without any of its layout or colour rules.
- `docker-compose.yml` pins the 0.1.1 image rather than 0.1.0.

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
