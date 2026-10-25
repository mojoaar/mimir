# Mimir

Long-term memory for coding agents. Self-hosted, path-based, and readable by a human.

> **Mímir** was the Norse god whose well held wisdom and memory; Odin (Óðinn) traded an eye for a single draught from it. The name is the same word as *memory* and *remember* — and a memory worth an eye is the right standard for one your agents drink from.

An agent asks "what do we already know about this project?" and gets back the decisions, conventions and gotchas that were learned the hard way — scoped to the repository it is standing in. Memory is a tree of paths with three levels of detail, so an agent pays for one line until it needs the whole thing.

Nothing is stored as an opaque embedding you cannot inspect. Every memory is a path with a title, a summary and a body, served over MCP and REST.

## Status

`0.2.0` — boots from one container, authenticates a user, stores and retrieves memory over MCP and REST, learns a title and a summary for every memory with your own model, and searches by keyword and by meaning.

Not yet: backups, MFA, the admin user and audit pages, a memory browser, i18n, the docs site, and importing an existing repository. The schema and seams for all of them are in place; see the [design](docs/superpowers/specs/2026-10-25-mimir-design.md).

## Quick start

```bash
cp .env.example .env
openssl rand -hex 32          # paste into MIMIR_SECRET
```

Then set the two database passwords. `docker compose up` refuses to start without them, and both must be URL-safe: they are interpolated into the connection strings.

```bash
# in .env
POSTGRES_OWNER_PASSWORD=...
MIMIR_APP_PASSWORD=...
```

```bash
docker compose up -d
```

An install created before 0.3.0 runs PostgreSQL 17. Moving it needs a dump from a 17 client (`pg_dump -Fc`) and a `pg_restore` into the 18 volume — the new image will not start on the old data directory. There is no automatic migration; a fresh volume with re-entered settings is the alternative.

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

## Connect a model

Two independent settings, because they answer different questions.

**Learning** (title and summary for each memory) is per user: **Settings → Providers**, add DeepSeek or OpenCode Go with your key, press **Test connection**. Extraction reads the project owner's provider, so whoever owns the memory pays for it.

**Search** is install-wide and set by an admin: **Admin → Settings**, point it at an embedding model. Until one is configured, search works on keywords alone — you lose nothing, you just get no semantic matches.

Ollama is the homelab default (`nomic-embed-text`, 768 dimensions). The base URL depends on where Ollama runs:

| Where Ollama runs | Base URL |
|---|---|
| On the host, Mimir in Docker | `http://host.docker.internal:11434` |
| As a compose sidecar (profile `ollama`) | `http://ollama:11434` |
| Remote | `https://…` |

Ollama binds to `127.0.0.1` by default, so the host case needs `OLLAMA_HOST=0.0.0.0`, and the model has to be present:

```bash
ollama pull nomic-embed-text
```

Changing the embedding model invalidates every stored vector, so **Admin → Settings → Re-embed everything** rebuilds the index. Search keeps working on keywords while it runs.

For extraction, pick an instruct model. A reasoning model can spend its whole token budget thinking and reply with nothing, and Mimir will skip that memory rather than guess.

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
