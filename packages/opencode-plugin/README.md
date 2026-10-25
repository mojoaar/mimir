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

Ask the agent to call `mimir_digest` when a session starts. If you want that
automatic, use the Claude Code style hook (`hooks/mimir-session-start.sh` in the
Mimir repository) or put this in your `AGENTS.md`:

> Call `mimir_digest` before your first action. Store durable decisions with
> `mimir_remember` as you make them.

Both tools fail soft: if Mimir is down or the variables are missing, the tool
says so and the session carries on.

## Why there is no automatic injection

The OpenCode plugin API documents tool registration, not context injection. A
hook that silently prepended text to every session would be guessing at an
undocumented surface, so this package registers tools and leaves the trigger to
the agent's instructions.
