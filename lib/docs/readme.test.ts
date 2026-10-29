import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const readme = readFileSync(join(process.cwd(), 'README.md'), 'utf8')

describe('the readme', () => {
  it('says a project can be a folder, not only a repository', () => {
    expect(readme).toContain('claim a folder')
  })

  it('documents every tool the server exposes', () => {
    for (const tool of [
      'memory_digest',
      'memory_search',
      'memory_tree',
      'memory_read',
      'memory_write',
      'memory_ingest',
      'memory_delete',
      'project_list',
    ]) {
      expect(readme, tool).toContain(`\`${tool}\``)
    }
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
