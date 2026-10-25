# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Repository scaffold: Next.js 16 (App Router, TypeScript strict), Tailwind v4, Vitest.
- Fail-fast configuration: `MIMIR_SECRET` is required and never generated.
- AES-256-GCM encryption helpers and secret redaction.
- Postgres schema with row-level security and two database roles (`mimir_owner`, `mimir_app`).
- Locked, idempotent migrations that run at boot.
- Transaction helper that sets `mimir.user_id` per request and cannot leak between pooled connections.
- Append-only audit log.
- argon2id passwords, hashed session cookies, and API keys.
- Bootstrap admin created from environment variables, once, on an empty install.
