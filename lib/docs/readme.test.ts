import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const readme = readFileSync(join(process.cwd(), 'README.md'), 'utf8')

describe('the readme', () => {
  it('says a project can be a folder, not only a repository', () => {
    expect(readme).toContain('claim a folder')
  })

  it('says a folder claim is personal, so a team needs the repository', () => {
    expect(readme).toContain('the project explicitly')
  })

  it('lists every tool the server exposes, and says how many', async () => {
    const { TOOL_NAMES } = await import('@/lib/mcp/tools')
    for (const tool of TOOL_NAMES) expect(readme, tool).toContain(`\`${tool}\``)
    expect(readme).toContain(`${TOOL_NAMES.length} MCP tools`)
  })

  it('sends nobody to a Settings page that does not exist', () => {
    // "Admin → Settings → Re-embed everything" is a real path and stays; what
    // went away in 0.17.0 is the user's own Settings page.
    for (const gone of ['Settings → Providers', 'Settings → API keys', 'Settings → Security', 'under **Settings**']) {
      expect(readme, gone).not.toContain(gone)
    }
  })

  it('calls learning per project, not per user', () => {
    expect(readme).toContain('is per project')
    expect(readme).not.toContain('is per user')
  })
})
