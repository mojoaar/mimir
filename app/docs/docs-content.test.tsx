import { readFileSync } from 'node:fs'
import path from 'node:path'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { TOOL_NAMES } from '@/lib/mcp/tools'

const pkg = JSON.parse(readFileSync(path.join(process.cwd(), 'package.json'), 'utf8')) as { version: string }

import ApiPage from './api/page'
import BackupsPage from './backups/page'
import ChangelogPage from './changelog/page'
import McpPage from './mcp/page'
import SearchPage from './search/page'
import SelfHostingPage from './self-hosting/page'
import ToolsPage from './tools/page'

const pages = [
  ['self-hosting', SelfHostingPage],
  ['backups', BackupsPage],
  ['mcp', McpPage],
  ['api', ApiPage],
  ['tools', ToolsPage],
  ['search', SearchPage],
  ['changelog', ChangelogPage],
] as const

describe('docs content', () => {
  it.each(pages)('%s renders a real page', async (_name, Page) => {
    const html = renderToStaticMarkup(await Page())

    expect(html).toContain('<h1')
    expect(html).not.toContain('TODO')
  })

  it('names every mcp tool', async () => {
    const html = renderToStaticMarkup(await McpPage())

    for (const tool of TOOL_NAMES) {
      expect(html).toContain(tool)
    }
  })

  it('shows the routes that exist', async () => {
    const html = renderToStaticMarkup(await ApiPage())

    expect(html).toContain('/api/v1/projects')
    expect(html).toContain('/api/v1/projects/:slug/search')
  })

  it('renders the current version', async () => {
    const html = renderToStaticMarkup(await ChangelogPage())

    expect(html).toContain(pkg.version)
  })
})
