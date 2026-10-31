# Mimir for Claude Code

Long-term project memory, delivered where Claude Code can use it: the project digest at session start, a handover
before compaction, and the Mimir tools over MCP.

## What it adds

- **The digest at session start.** Before the first turn, the plugin asks Mimir what this project already knows and
  puts it in the context, so the session does not start from zero.
- **A handover before compaction.** The moment Claude Code is about to compact, the plugin sends the part of the
  conversation worth keeping to Mimir. The detail survives the summary.
- **`/mimir-learn` on demand.** Hand the session over now, without waiting for compaction.
- **The Mimir tools.** The bundled `.mcp.json` connects the same server, so `memory_search`, `memory_read`,
  `memory_write` and the rest are available as MCP tools.

## Install

In Claude Code:

```
/plugin marketplace add mojoaar/mimir
/plugin install mimir@mimir
```

Then set three environment variables in the shell that starts Claude Code:

```sh
export MIMIR_URL=https://mimir.example.com
export MIMIR_TOKEN=mimir_...
export MIMIR_PROJECT=my-project
```

`MIMIR_PROJECT` is the project slug in Mimir, not the directory name. Everything is silent when a variable is
missing: a session is never blocked or delayed by Mimir.

## The manual hook is now a plugin

An earlier version of this repository shipped `hooks/mimir-session-start.sh`, a plain-text `SessionStart` hook. On
Claude Code 2.1 and later a `SessionStart` hook must print JSON with `hookSpecificOutput.additionalContext`, so that
script is an error on current versions. This plugin emits the JSON form and is the maintained path.

## Verify

```
/mcp
```

should list `mimir`. If it does not, check that `MIMIR_URL` is set in the environment Claude Code was started from.
