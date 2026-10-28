export type DocLink = { href: string; title: string }
export type DocGroup = { title: string; href?: string; links: DocLink[] }

export const DOCS_NAV: DocGroup[] = [
  {
    title: 'Start',
    links: [
      { href: '/docs', title: 'Overview' },
      { href: '/docs/how-it-works', title: 'How Mimir works' },
      { href: '/docs/providers', title: 'Providers and embeddings' },
      { href: '/docs/self-hosting', title: 'Self-hosting' },
      { href: '/docs/backups', title: 'Backups' },
    ],
  },
  {
    title: 'Integrate',
    links: [
      { href: '/docs/mcp', title: 'MCP' },
      { href: '/docs/api', title: 'HTTP API' },
      { href: '/docs/plugins', title: 'Plugins' },
    ],
  },
  {
    title: 'Agents',
    href: '/docs/agents',
    links: [
      { href: '/docs/agents/opencode', title: 'OpenCode' },
      { href: '/docs/agents/claude-code', title: 'Claude Code' },
      { href: '/docs/agents/codex', title: 'Codex' },
      { href: '/docs/agents/cursor', title: 'Cursor' },
      { href: '/docs/agents/gemini-cli', title: 'Gemini CLI' },
      { href: '/docs/agents/pi', title: 'Pi' },
      { href: '/docs/agents/oh-my-pi', title: 'Oh My Pi' },
      { href: '/docs/agents/antigravity', title: 'Antigravity' },
      { href: '/docs/agents/hermes', title: 'Hermes' },
      { href: '/docs/agents/muse', title: 'Muse' },
    ],
  },
  {
    title: 'Reference',
    links: [
      { href: '/docs/tools', title: 'MCP tools' },
      { href: '/docs/search', title: 'How search works' },
      { href: '/docs/changelog', title: 'Changelog' },
    ],
  },
]

export const DOCS_SLUGS: string[] = DOCS_NAV.flatMap((group) => group.links.map((link) => link.href))
