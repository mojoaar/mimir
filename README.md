# Mimir

Long-term memory for coding agents. Self-hosted, path-based, and readable by a human.

An agent asks "what do we already know about this project?" and gets back the decisions, conventions and gotchas that were learned the hard way — scoped to the repository it is standing in. Memory is a tree of paths with three levels of detail, so an agent pays for one line until it needs the whole thing.

Nothing is stored as an opaque embedding you cannot inspect. Every memory is a file you can open, correct or delete from the web UI.

## Status

`0.1.0` — boots from one container, authenticates a user, and stores and retrieves memory over MCP and REST.

Not yet: provider configuration UI, background extraction, backups, admin pages, i18n, and the docs site. The schema and seams for all of them are in place; see the [design](docs/superpowers/specs/2026-10-25-mimir-design.md).

## Quick start

```bash
cp .env.example .env
openssl rand -hex 32          # paste into MIMIR_SECRET
docker compose up -d
```

Open http://localhost:3000, sign in with `MIMIR_ADMIN_EMAIL` / `MIMIR_ADMIN_PASSWORD`, then create an API key under **Settings**. Point an agent at `http://localhost:3000/mcp`:

```json
{
  "mcp": {
    "mimir": {
      "type": "remote",
      "url": "http://localhost:3000/mcp",
      "headers": { "Authorization": "Bearer mimir_..." }
    }
  }
}
```

`MIMIR_SECRET` is required and never generated: it also keys backups, so a restart that invented a new one would silently orphan every stored credential.

## Tools

Seven MCP tools, mirrored one-to-one on `/api/v1`:

| Tool | Purpose |
|---|---|
| `memory_digest` | Session-start context: titles plus recent summaries, inside a token budget |
| `memory_search` | Hybrid search, optionally scoped to a path prefix |
| `memory_tree` | List a directory of memory (virtual directories, L0 titles only) |
| `memory_read` | One memory, with its summary and body |
| `memory_write` | Upsert one path |
| `memory_delete` | Soft delete, recoverable for 30 days |
| `project_list` | Projects the caller can reach |

The client sends the repo key (`X-Mimir-Repo: github.com/owner/repo`), so two agents working in one checkout share one project without configuration.

## Development

```bash
./scripts/test-db.sh up      # Postgres 17 + pgvector on 127.0.0.1:5433
npm install
npm run dev
npm test                     # unit
npm run test:int             # integration, needs the database above
npm run typecheck
```

## License

MIT. If this saves you time, [buy me a coffee](https://buymeacoffee.com/mojoaar).
