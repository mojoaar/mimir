# @mojoaar/omp-mimir

Mimir memory for [oh-my-pi](https://omp.sh) sessions: the digest in front of the
first turn, a reminder to write before the context is compacted, and four tools.

```sh
omp plugin install @mojoaar/omp-mimir
```

Then point it at your install. `MIMIR_URL` and `MIMIR_TOKEN` do the work; the
token can live in a file instead, `~/.omp/mimir-token` by default:

```sh
export MIMIR_URL=https://mimir.example.com
export MIMIR_TOKEN=mimir_...
```

`MIMIR_REPO` overrides the repository read from `git remote get-url origin` in
the session's working directory.

## What you get

| Tool | What it does |
|---|---|
| `mimir_digest` | What this project already knows, dated. Also injected automatically. |
| `mimir_remember` | Stores one durable fact at a path like `deploy/rollback`. The same path again replaces it. |
| `mimir_search` | Hybrid search over this project's memories. Needs Mimir 0.20.0 or newer. |
| `mimir_learn` | Hands a transcript over; the project's own model writes at most three memories. |

The digest and the reminder arrive on their own. Everything fails soft: if Mimir
is down or unconfigured, the plugin is silent and the session carries on.

When the context is compacted it also hands that part of the session to Mimir,
which distils at most three memories from it.

MCP is not required. If you already use the Mimir MCP server in oh-my-pi, the
plugin's tools are still worth having, because MCP cannot inject the digest.

The plugin reads the same REST endpoint the OpenCode plugin does, so it needs a
Mimir server, not a particular harness.
