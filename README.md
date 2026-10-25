# Mimir

Long-term memory for coding agents, self-hosted.

An agent asks "what do we already know about this project?" and gets back the
decisions, conventions and gotchas, scoped to the repo it is standing in.
Memory is stored as paths (`auth/jwt/refresh-rotation`) with three levels of
detail, so an agent can pay for a title until it needs a body.

Status: v0.1.0 in development. Not usable yet.

- Design: [`docs/superpowers/specs/2026-10-25-mimir-design.md`](docs/superpowers/specs/2026-10-25-mimir-design.md)
- License: MIT

## Development

```bash
npm install
npm run dev        # http://localhost:3000
npm test           # unit tests
npm run typecheck
npm run build
```

Integration tests need a database; see `scripts/test-db.sh` once it exists.

## Support

[Buy me a coffee](https://buymeacoffee.com/mojoaar)
