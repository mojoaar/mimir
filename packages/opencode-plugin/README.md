# @mojoaar/opencode-mimir

Mimir memory for [OpenCode](https://opencode.ai): two tools, no ceremony.

```sh
npm install @mojoaar/opencode-mimir
```

Add it to `opencode.json` (or `~/.config/opencode/opencode.json`):

```json
{
  "plugin": ["@mojoaar/opencode-mimir"]
}
```

Then export the two variables OpenCode runs with:

```sh
export MIMIR_URL=https://mimir.example.com
export MIMIR_TOKEN=mimir_...     # mint it at /app/settings
export MIMIR_REPO=github.com/you/your-repo   # optional; otherwise read from git
```

## What you get

| Tool | What it does |
|---|---|
| `mimir_digest` | Returns what this project already knows: paths, titles, and a summary of the newest memories. |
| `mimir_remember` | Stores one durable fact at a path like `deploy/rollback`. Writing the same path again replaces it. |

Ask the agent to call `mimir_digest` when a session starts as a belt-and-braces
fallback, and put this in your `AGENTS.md`:

> Call `mimir_digest` before your first action. Store durable decisions with
> `mimir_remember` as you make them.

Both tools fail soft: if Mimir is down or the variables are missing, the tool
says so and the session carries on.

## The digest arrives on its own

The plugin also uses OpenCode's `experimental.chat.system.transform` hook to put
the project's digest at the top of the system prompt before the first turn. It
asks for 800 tokens with a 1.5 second timeout, and does nothing at all when Mimir
is unreachable, slow, or unconfigured — a session never waits on memory.

The hook is named experimental because that is how the plugin API marks it. If a
future OpenCode release renames or drops it, the plugin keeps working and you
lose only the automatic part; `mimir_digest` still answers.

## Import an existing project

```
npx @mojoaar/opencode-mimir ingest .
```

Walks the folder and loads its **documentation and configuration** — READMEs,
`docs/`, markdown, compose files, `package.json` — under the `import/` path
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
