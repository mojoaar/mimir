import { readFileSync } from 'node:fs'
import path from 'node:path'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { TOOL_NAMES } from '@/lib/mcp/tools'
import { DOCS_NAV } from '@/lib/docs/nav'

const pkg = JSON.parse(readFileSync(path.join(process.cwd(), 'package.json'), 'utf8')) as { version: string }

import AgentsIndex from './agents/page'
import ApiPage from './api/page'
import BackupsPage from './backups/page'
import ChangelogPage from './changelog/page'
import HowItWorksPage from './how-it-works/page'
import ProvidersPage from './providers/page'
import DocsIndex from './page'
import McpPage from './mcp/page'
import PluginsPage from './plugins/page'
import SearchPage from './search/page'
import SelfHostingPage from './self-hosting/page'
import ToolsPage from './tools/page'

const pages = [
  ['how-it-works', HowItWorksPage],
  ['providers', ProvidersPage],
  ['self-hosting', SelfHostingPage],
  ['backups', BackupsPage],
  ['mcp', McpPage],
  ['plugins', PluginsPage],
  ['api', ApiPage],
  ['tools', ToolsPage],
  ['search', SearchPage],
  ['changelog', ChangelogPage],
  ['agents', AgentsIndex],
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

  it('says the protocol arrives on connect', async () => {
    const html = renderToStaticMarkup(await McpPage())

    expect(html).toContain('What the agent is told')
    expect(html).toContain('initialize')
    expect(html).toContain('One memory is one outcome')
  })

  it('separates the plain endpoint from the plugin', async () => {
    const html = renderToStaticMarkup(AgentsIndex())

    expect(html).toContain('What you get')
    expect(html).toContain('OpenCode and Oh My Pi plugins')
    expect(html).toContain('href="/docs/plugins"')
    expect(html).toContain('initialize')
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

  it('keeps a wrapped bullet in one paragraph', async () => {
    const html = renderToStaticMarkup(await ChangelogPage())

    // The file is hard-wrapped; a continuation line is not a new item.
    expect(html).toContain('not only write blind. mimir_search and mimir_learn join mimir_digest')
    expect(html).not.toContain('<p>mimir_digest and mimir_remember')
  })

  it('links the whole raw file instead of a cut-off sample', async () => {
    const html = renderToStaticMarkup(await ChangelogPage())

    // The page used to render the first 400 characters of the file, which ended
    // mid-word and offered no way to the rest of it.
    expect(html).toContain('href="/changelog.md"')
    expect(html).not.toContain('All notable changes to this project')
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

describe('destinations', () => {
  // The user's own Settings page went away in 0.17.0: keys, two-factor and the
  // profile share one page, and Providers sits in the header. A page still
  // saying "Settings → X" sends people looking for a section that is not there.
  it.each([
    ['how-it-works', HowItWorksPage],
    ['providers', ProvidersPage],
    ['mcp', McpPage],
    ['api', ApiPage],
  ] as const)('%s sends nobody to a Settings section', async (_name, Page) => {
    const html = renderToStaticMarkup(await Page())

    for (const stale of ['Settings → Providers', 'Settings → API keys', 'Settings → Security', 'Settings → Profile']) {
      expect(html, stale).not.toContain(stale)
    }
  })
})

describe('the index', () => {
  it('links every page it is the entry point for', async () => {
    const html = renderToStaticMarkup(await DocsIndex())

    // Tool reference and changelog had no inbound link anywhere.
    expect(html).toContain('href="/docs/tools"')
    expect(html).toContain('href="/docs/changelog"')
  })
})

describe('pageview analytics', () => {
  it('says where the values go and what it sends', async () => {
    const html = renderToStaticMarkup(await SelfHostingPage())

    expect(html).toContain('Pageview analytics')
    expect(html).toContain('Do Not Track')
    expect(html).toContain('/script.js')
  })
})

describe('the account page', () => {
  it('explains the profile, the password and the sessions', async () => {
    const html = renderToStaticMarkup(await SelfHostingPage())

    expect(html).toContain('Profile</strong> in the user menu')
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

describe('the name', () => {
  it('explains where it comes from on the overview', () => {
    const html = renderToStaticMarkup(DocsIndex())

    expect(html).toContain('Mímir')
    expect(html).toContain('well')
    expect(html).toContain('traded an eye')
  })
})

describe('session learning', () => {
  it('documents memory_learn and the procedure kind', async () => {
    const html = renderToStaticMarkup(await ToolsPage())

    expect(html).toContain('memory_learn')
    expect(html).toContain('procedure')
  })

  it('says why procedures lead the digest', async () => {
    const html = renderToStaticMarkup(await HowItWorksPage())

    expect(html).toContain('Procedures are always listed first')
  })
})

describe('plugins', () => {
  it('compares MCP with the plugin, and shows both installs', async () => {
    // The code block is highlighted into spans, so compare the text, not the markup.
    const text = renderToStaticMarkup(await PluginsPage()).replace(/<[^>]+>/g, '')

    expect(text).toContain('MCP or plugin')
    expect(text).toContain('injected once per session')
    expect(text).toContain('opencode plugin add @mojoaar/opencode-mimir')
    expect(text).toContain('omp plugin install @mojoaar/omp-mimir')
    expect(text).toContain('All nine')
  })

  it('sits in the sidebar and on the index', async () => {
    const slugs = DOCS_NAV.flatMap((group) => group.links.map((link) => link.href))
    expect(slugs).toContain('/docs/plugins')

    const html = renderToStaticMarkup(await DocsIndex())
    expect(html).toContain('href="/docs/plugins"')
  })

  it('documents the command that hands a session over now', async () => {
    const text = renderToStaticMarkup(await PluginsPage()).replace(/<[^>]+>/g, '')

    expect(text).toContain('/mimir-learn')
    expect(text).toContain('sends the conversation so far')
  })

  it('says what happens when the context is compacted', async () => {
    const text = renderToStaticMarkup(await PluginsPage()).replace(/<[^>]+>/g, '')

    expect(text).toContain('When the context is compacted')
    expect(text).toContain('memory_learn')
    expect(text).toContain('three memories')
  })
})

describe('provenance', () => {
  it('says where a memory came from, and that it is optional', async () => {
    const html = renderToStaticMarkup(await ToolsPage())

    expect(html).toContain('traced back to the conversation')
    expect(html).toContain('client')
    expect(html).toContain('session')
  })
})

describe('folders as a repo', () => {
  it('explains that a folder can stand in for a repository', () => {
    const html = renderToStaticMarkup(McpPage())

    expect(html).toContain('Claim a folder under a project')
    expect(html).toContain('A git remote wins')
  })
})
