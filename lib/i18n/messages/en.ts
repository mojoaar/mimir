export const en = {
  'hero.title': 'Long-term memory for your agents',
  'hero.subtitle':
    'Mimir remembers what your coding agents learn — across sessions, across agents, across machines. Self-hosted, yours to keep.',
  'hero.docs': 'Read the docs',
  'hero.github': 'GitHub',
  'hero.docker': 'docker compose up -d',
  'features.title': 'What it holds',
  'features.path.title': 'Memory is a path',
  'features.path.body':
    'Every memory lives at a path like deploy/rollback, with a one-line title, a summary and the full text. Agents list, read and search it like a filesystem.',
  'features.api.title': 'One endpoint, every agent',
  'features.api.body':
    'MCP over HTTP for OpenCode, Claude Code, Codex, Cursor and the rest, plus a plain REST mirror for anything that speaks curl.',
  'features.private.title': 'Yours alone',
  'features.private.body':
    'Runs in your homelab on one container and one database. User accounts, per-project grants, two-factor sign-in, encrypted backups.',
  'footer.tagline': 'The well of memory, for your agents.',
  'footer.license': 'MIT licensed',
  'footer.support': 'Buy me a coffee',
} satisfies Record<string, string>;

export type Messages = typeof en;
