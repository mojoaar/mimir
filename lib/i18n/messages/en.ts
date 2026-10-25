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
  'app.layout.mfaRequired': 'Two-factor is required',
  'app.layout.mfaRequiredBody':
    'This install requires an authenticator app before the app can be used.',
  'app.layout.blocked': 'Not available here',
  'app.layout.blockedBody':
    'This address is not allowed to reach Mimir. Ask the administrator which networks are permitted.',
  'app.nav.projects': 'Projects',
  'app.nav.teams': 'Teams',
  'app.nav.settings': 'Settings',
  'app.nav.providers': 'Providers',
  'app.nav.docs': 'Docs',
  'app.nav.admin': 'Admin',
  'app.nav.signOut': 'Sign out',
  'app.language.label': 'Language',
  'app.admin.nav.admin': 'Admin',
  'app.admin.nav.users': 'Users',
  'app.admin.nav.embeddings': 'Embeddings',
  'app.admin.nav.backups': 'Backups',
  'app.admin.nav.audit': 'Audit',
  'app.admin.nav.site': 'Site',
  'app.admin.nav.back': 'Back to app',
  'footer.tagline': 'The well of memory, for your agents.',
  'footer.license': 'MIT licensed',
  'footer.support': 'Buy me a coffee',
} satisfies Record<string, string>;

export type Messages = typeof en;
