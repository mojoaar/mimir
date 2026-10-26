import { readFileSync } from 'node:fs'
import path from 'node:path'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { TOOL_NAMES } from '@/lib/mcp/tools'

const pkg = JSON.parse(readFileSync(path.join(process.cwd(), 'package.json'), 'utf8')) as { version: string }

import ApiPage from './api/page'
import BackupsPage from './backups/page'
import ChangelogPage from './changelog/page'
import HowItWorksPage from './how-it-works/page'
import ProvidersPage from './providers/page'
import McpPage from './mcp/page'
import SearchPage from './search/page'
import SelfHostingPage from './self-hosting/page'
import ToolsPage from './tools/page'

const pages = [
  ['how-it-works', HowItWorksPage],
  ['providers', ProvidersPage],
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

  it('shows a raw mcp call and its envelope', async () => {
    const html = renderToStaticMarkup(await McpPage())

    expect(html).toContain('tools/call')
    expect(html).toContain('jsonrpc')
    expect(html).toContain('2025-06-18')
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
    // A route table alone does not teach; the page carries request and response.
    expect(html).toContain('&quot;memoryCount&quot;')
    expect(html).toContain('restored')
    expect(html).toContain('body_too_large')
  })

  it('renders the current version', async () => {
    const html = renderToStaticMarkup(await ChangelogPage())

    expect(html).toContain(pkg.version)
  })
})

describe('the import page', () => {
  it('documents the ingest command', async () => {
    const html = renderToStaticMarkup(await SelfHostingPage())

    expect(html).toContain('mimir ingest')
    expect(html).toContain('--project')
  })
})

describe('the sharing section', () => {
  it('explains teams and what they can do', async () => {
    const html = renderToStaticMarkup(await SelfHostingPage())

    expect(html).toContain('team')
    expect(html).toContain('share')
    expect(html).toContain('never the owner')
  })
})

describe('the account page', () => {
  it('explains the profile, the password and the sessions', async () => {
    const html = renderToStaticMarkup(await SelfHostingPage())

    expect(html).toContain('Settings → Profile')
    expect(html).toContain('password change')
    expect(html).toContain('sessions signed in')
  })
})

describe('the language section', () => {
  it('explains the menu, the saved choice and the public pages', async () => {
    const html = renderToStaticMarkup(await SelfHostingPage())

    expect(html).toContain('English, Danish and German')
    expect(html).toContain('saved on the account')
    expect(html).toContain('/da')
  })
})

describe('the explanation pages', () => {
  it('explains the memory model without a model configured', async () => {
    const html = renderToStaticMarkup(await HowItWorksPage())

    expect(html).toContain('Paths are the index')
    expect(html).toContain('20 versions')
    expect(html).toContain('800 tokens')
  })

  it('names every provider preset and the dimension rule', async () => {
    const html = renderToStaticMarkup(await ProvidersPage())

    for (const preset of ['DeepSeek', 'OpenCode Go', 'Ollama', 'Octen', 'Mistral', 'OpenAI-compatible']) {
      expect(html).toContain(preset)
    }
    expect(html).toContain('vector(768)')
    expect(html).toContain('codestral-embed')
  })
})
