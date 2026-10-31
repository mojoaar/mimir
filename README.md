# Mimir

Long-term memory for coding agents. Self-hosted, path-based, and readable by a human.

> **Mímir** was the Norse god whose well held wisdom and memory; Odin (Óðinn) traded an eye for a single draught from it. The name is the same word as _memory_ and _remember_ - and a memory worth an eye is the right standard for one your agents drink from.

An agent asks "what do we already know about this project?" and gets back the decisions, conventions and gotchas that were learned the hard way - scoped to the repository it is standing in. Memory is a tree of paths with three levels of detail, so an agent pays for one line until it needs the whole thing.

Nothing is stored as an opaque embedding you cannot inspect. Every memory is a path with a title, a summary and a body, served over MCP and REST.

## Status

`0.31.1` - one container that authenticates users, stores and retrieves memory over MCP and REST, learns a title and a summary with your own model, and searches by keyword and by meaning.
It backs itself up on a schedule, meters every remote model call on an admin usage page, and ships a localised landing page and a docs site with a config per agent.
An agent can hand over a transcript and the project's own model distils it into memories, and a `procedure` is a kind
that leads the session digest however old it is. The digest names a `gotcha` and a `decision` so a trap does not read
like a note, and the OpenCode plugin can search, read, learn and write every kind the server accepts.
Oh My Pi has a plugin too: `@mojoaar/omp-mimir` puts the digest in front of the first turn, which MCP cannot do.
Both plugins also hand the messages a compaction is about to replace to `memory_learn`, so a long session writes its
own memories instead of waiting for the agent to remember.
The landing page shows what an agent actually receives: the ten clients it works with, the digest, one search across
every project, and three ways to connect an agent. Memories can be sorted by path, by when they were added or by when
they changed, and both plugins take `/mimir-learn` to hand a session over on demand.
One search box on the dashboard asks every project you can read at once and groups the answers by where they came from,
and `memory_search` does the same for an agent that names no project. A project can be exported as one Markdown or
JSON file, from the project header, the API or `mimir export`. A search hit can be read back without an MCP server
beside it, and a second person on a repository can ask its owner for access from `/app/requests`.
A directory that is not a repository can claim a folder instead, so a session started there writes to the right project, and every memory records the client and the session that wrote it. An archived project can be deleted for good, which also frees the repository or folder it was holding.
Projects can be shared with a person or a team at read or write, each user owns their name, email and password and can sign out their other devices, and the whole app is available in English, Danish and German.
Analytics is optional: point it at your own Umami instance in the admin settings and every page sends a pageview, with no cookies and Do Not Track respected.

Everything in the [design](docs/superpowers/specs/2026-10-25-mimir-design.md) has now shipped.

## Documentation

The running install serves its own docs at `/docs`. Start with **How Mimir works**
for the model (projects, paths, versions, digest, search, teams, audit) and
**Providers and embeddings** for which model does what and what a call costs.
There is also a page per agent
(OpenCode, Claude Code, Codex, Cursor, Gemini CLI, Pi, Oh My Pi, Antigravity, Hermes,
Muse) with the exact config file each one reads. The OpenCode plugin is
`@mojoaar/opencode-mimir`, which runs on the OpenCode v2 plugin API and installs straight from this
repository (`github:mojoaar/mimir#main::path:packages/opencode-plugin`); it needs a URL and a token, passed as
plugin options or exported as `MIMIR_URL` and `MIMIR_TOKEN`, or it loads and stays inactive; Oh My Pi installs
`@mojoaar/omp-mimir` with `omp plugin install @mojoaar/omp-mimir`; Claude Code installs the plugin from this
repository with `/plugin marketplace add mojoaar/mimir` and `/plugin install mimir@mimir`.

The server also sends its protocol to every MCP client on `initialize` - digest first,
search before re-deriving, one memory per outcome. A client that does not show that to
the model gets the same text as a copyable block on its page under `/docs/agents`.

An existing project can be loaded in one command:

```bash
npx @mojoaar/opencode-mimir ingest .
```

That imports its documentation and configuration (not its source) into the
same project your agents write to.

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

An install created before 0.3.0 runs PostgreSQL 17. Moving it needs a dump from a 17 client (`pg_dump -Fc`) and a `pg_restore` into the 18 volume - the new image will not start on the old data directory. There is no automatic migration; a fresh volume with re-entered settings is the alternative.

Open http://localhost:3000, sign in with `MIMIR_ADMIN_EMAIL` / `MIMIR_ADMIN_PASSWORD`, then create an API key from the user menu under **Profile**. Point an agent at `http://localhost:3000/mcp`:

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

11 MCP tools, mirrored one-to-one on `/api/v1`:

| Tool              | Purpose                                                                    |
| ----------------- | -------------------------------------------------------------------------- |
| `memory_digest`   | Session-start context: titles plus recent summaries, inside a token budget |
| `memory_search`   | Hybrid search, optionally scoped to a path prefix                          |
| `memory_tree`     | List a directory of memory (virtual directories, L0 titles only)           |
| `memory_read`     | One memory, with its summary and body                                      |
| `memory_write`    | Upsert one path                                                            |
| `memory_ingest`   | Bulk import: up to 100 files (2 MB) into one path prefix                   |
| `memory_learn`    | Hand over a transcript; the project model writes up to three memories      |
| `memory_versions` | The versions of one path, newest first, with size and writer               |
| `memory_restore`  | Put a version back; the current body is archived first                     |
| `memory_delete`   | Soft delete, recoverable for 30 days                                       |
| `project_list`    | Projects the caller can reach                                              |

The client sends the repo key (`X-Mimir-Repo: github.com/owner/repo`), so two agents working in one checkout share one project without configuration. A directory that is not a repository can claim a folder instead: claim it on the project's settings page and every session you start in it or below it writes there, with a git remote still winning over a folder. The claim is personal, so a teammate on a shared project reaches it through a checkout of the same repository or by naming the project explicitly. A write can also carry the `client` and `session` that made it, which the memory's history then shows.

## Connect a model

Two independent settings, because they answer different questions.

**Learning** (title and summary for each memory) is per project and runs on the project owner's provider: add one under **Providers** in the header, press **Test connection**, then pick it in that project's settings. Extraction reads the project owner's provider, so whoever owns the memory pays for it.

**Search** is install-wide and set by an admin: **Admin → Settings**, point it at an embedding model. Until one is configured, search works on keywords alone - you lose nothing, you just get no semantic matches.

Ollama is the homelab default (`nomic-embed-text`, 768 dimensions). Octen is a
hosted alternative - add it under **Providers**, pick one of its three
models, and give it a key. Mistral's `codestral-embed` works the same way. All of
them answer at the 768 dimensions the schema stores.

Every provider call is recorded with its tokens and its cost at the price the
provider carried at the time; **Admin → Usage** shows the month split between
language and embedding spend, per-model and per-person breakdowns, failures, and
a dismissible warning when an hour runs far above the recent baseline. Providers
start at their list price and can be repriced per row; an unpriced provider still
counts calls, it just shows under **Unpriced**. The base URL depends on where Ollama runs:

| Where Ollama runs                       | Base URL                            |
| --------------------------------------- | ----------------------------------- |
| On the host, Mimir in Docker            | `http://host.docker.internal:11434` |
| As a compose sidecar (profile `ollama`) | `http://ollama:11434`               |
| Remote                                  | `https://…`                         |

Ollama binds to `127.0.0.1` by default, so the host case needs `OLLAMA_HOST=0.0.0.0`, and the model has to be present:

```bash
ollama pull nomic-embed-text
```

Changing the embedding model invalidates every stored vector, so **Admin → Settings → Re-embed everything** rebuilds the index. Search keeps working on keywords while it runs.

For extraction, pick an instruct model. A reasoning model can spend its whole token budget thinking and reply with nothing, and Mimir will skip that memory rather than guess.

## Backups

Admin → Backups sets a target and a schedule. A run produces two encrypted
artifacts: `mimir-YYYYMMDD-HHMMSS.dump.enc` (the whole database, `pg_dump -Fc`)
and `settings-YYYYMMDD-HHMMSS.json.enc` (settings, project metadata and provider
labels - never keys). Both are AES-256-GCM under a key derived from
`MIMIR_SECRET`, uploaded, then read back: a run is only recorded as successful
once every object reports the size that was uploaded. The newest N runs are kept
(14 by default) and older artifacts under the prefix are pruned.

Targets: any S3-compatible bucket (path-style supported for MinIO), or WebDAV -
`https://webdav.pcloud.com` with a pCloud app password.

Without `MIMIR_SECRET` a backup cannot be decrypted. Store it outside the
machine that holds the backups; it is the whole recovery story.

Restore is a command, not a button, because a restore over a live database
deserves a human:

```bash
docker cp mimir-20261026-030000.dump.enc mimir-mimir-1:/tmp/
docker compose exec mimir sh /app/scripts/restore.sh /tmp/mimir-20261026-030000.dump.enc --yes
```

`--clean` drops existing objects first. A plain `pg_dump` file works the same
way. To inspect an artifact without touching a database:

```bash
node scripts/decrypt-backup.mjs mimir-20261026-030000.dump.enc out.dump
pg_restore --list out.dump
```

## Accounts

The first admin comes from `MIMIR_ADMIN_EMAIL` / `MIMIR_ADMIN_PASSWORD`, once,
on an empty install. After that, Admin → Users creates, verifies, disables,
re-roles, resets and deletes users.

- An invited user sets a password at `/set-password/<token>` and stays `pending`
  until an admin verifies them.
- Disabling revokes every session and API key in the same transaction, so access
  ends on the next request, not at the next login.
- The last admin cannot be demoted, disabled or deleted, and nobody can disable
  or delete themselves.
- Two-factor is optional per user. Set `require_mfa` (Admin → Site) to force it;
  the bootstrap admin is exempt, so a misconfigured install cannot lock its only
  operator out. Admin → Users can reset a user's MFA, which is the recovery path
  when email is not configured.
- The IP allowlist (Admin → Site) takes CIDR blocks and applies to `/api/v1`,
  `/mcp`, the login page and the app. `/health` stays open for monitors. With an
  empty `MIMIR_TRUSTED_PROXIES` no client address can be read and a non-empty
  allowlist denies everything - set the proxy's address range first.

## Email

Optional. Set a Resend key and a From address in Admin → Site's email settings;
invites, password resets, MFA resets and backup failures are then emailed.
Without it those links are shown to the admin to copy, which is the expected
mode for a homelab. Resend requires a verified domain before it will send to
anyone other than your own account address.

## Development

```bash
./scripts/test-db.sh up      # Postgres 18 + pgvector on 127.0.0.1:5433
npm install
npm run dev
npm test                     # unit
npm run test:int             # integration, needs the database above
npm run typecheck
```

## License

MIT. If this saves you time, [buy me a coffee](https://buymeacoffee.com/mojoaar).
