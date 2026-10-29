# @mojoaar/opencode-mimir

Mimir memory for [OpenCode](https://opencode.ai) v2: two tools and an automatic
digest, no ceremony.

Install straight from the repository this package lives in:

```sh
opencode plugin add 'github:mojoaar/mimir#main::path:packages/opencode-plugin'
```

Or point at it in `opencode.json` (or `~/.config/opencode/opencode.jsonc`):

```jsonc
{
  "plugins": ["github:mojoaar/mimir#main::path:packages/opencode-plugin"]
}
```

The options form is the same entry with your settings attached:

```jsonc
{
  "plugins": [
    {
      "package": "github:mojoaar/mimir#main::path:packages/opencode-plugin",
      "options": {
        "url": "https://mimir.example.com",
        "tokenFile": "~/.config/opencode/.secrets/mimir-token",
        "tools": "auto"
      }
    }
  ]
}
```

`url`, `token` and `tokenFile` fall back to `MIMIR_URL` / `MIMIR_TOKEN`, and
`MIMIR_REPO` overrides the repository read from git. The token file is the same
one the MCP header can use.

## What you get

| Tool | What it does |
|---|---|
| `mimir_digest` | Returns what this project already knows: paths, titles, and a summary of the newest memories. |
| `mimir_remember` | Stores one durable fact at a path like `deploy/rollback`. Writing the same path again replaces it. |
| `mimir_search` | Hybrid search over this project's memories. |
| `mimir_learn` | Hands a transcript over; the project's own model writes at most three memories from it. |

When the context is compacted it also hands that part of the session to Mimir,
which distils at most three memories from it.

`tools` decides whether they are added: `auto` (default) leaves them out when an
MCP server already points at the same `/mcp` endpoint, `always` adds them
anyway, `never` adds none. With only the plugin installed, `auto` gives you
both.

Both tools fail soft: if Mimir is down or unconfigured, the tool says so and the
session carries on.

## The digest arrives on its own

The plugin registers a `context` hook that puts the project's digest at the top
of the system prompt before the first turn, once per session. It asks for 800
tokens with a 1.5 second timeout, and does nothing at all when Mimir is
unreachable, slow, or unconfigured - a session never waits on memory.

## Import an existing project

The package ships the importer as its `mimir` binary:

```sh
npx @mojoaar/opencode-mimir ingest .
```

Walks the folder and loads its **documentation and configuration** - READMEs,
`docs/`, markdown, compose files, `package.json` - under the `import/` path
prefix. Source code is skipped by default; the agent already has it.

| Flag | What it does |
|---|---|
| `--project <name>` | Name the project yourself. Required for a folder that is not a git repository. |
| `--all` | Import every text file, not just documentation. |
| `--dry-run` | Print what would be sent, send nothing. |
| `--url`, `--token` | Override `MIMIR_URL` / `MIMIR_TOKEN`. |

In a git repository the import lands in the project your agents already write
to (the normalised remote). With `--project` it lands in a project keyed by
name, so the same folder on another machine is a different project.

Exit codes: `0` everything imported, `1` something was skipped or a batch
failed, `2` bad arguments or no such directory.
