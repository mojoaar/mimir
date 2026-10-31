# Session-start hooks

Mimir can hand an agent the project digest before it starts work: the paths it
already knows, the newest ones with a summary. One request, no model call.

## Claude Code

The maintained path is the plugin in `packages/claude-plugin`: `/plugin
marketplace add mojoaar/mimir`, then `/plugin install mimir@mimir`. It prints
the JSON Claude Code requires, and adds the compaction handover and
`/mimir-learn`.

The script below still works, but only if it prints the JSON form: a
`SessionStart` hook on Claude Code 2.1 and later must emit
`hookSpecificOutput.additionalContext`, and plain text is now a hook error. The
script prints plain text, so it needs wrapping before you wire it to
`SessionStart` in `.claude/settings.json`:

```json
{
  "hooks": {
    "SessionStart": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "sh /path/to/mimir/hooks/mimir-session-start.sh"
          }
        ]
      }
    ]
  }
}
```

Set the three variables in the environment Claude Code runs in:

```sh
export MIMIR_URL=https://mimir.example.com
export MIMIR_TOKEN=mimir_...        # mint it at /app/settings
export MIMIR_PROJECT=mimir          # the project slug from /app
```

With any of them missing the script exits 0 and prints nothing, so a
misconfigured hook never blocks a session. It also gives up after three
seconds.

## Anything else

Any harness that can run a command at session start can use the same script.
If it needs JSON instead of text, drop `format=text` from the URL:

```sh
curl -fsS -H "Authorization: Bearer $MIMIR_TOKEN" \
  "$MIMIR_URL/api/v1/projects/$MIMIR_PROJECT/digest?budget_tokens=800"
```

That returns `{ "text": "...", "memoryCount": 4, "truncated": false }`.
