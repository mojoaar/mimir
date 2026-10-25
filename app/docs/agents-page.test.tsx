import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ notFound: vi.fn() }));

vi.mock('next/navigation', () => ({ notFound: mocks.notFound }));
vi.mock('next/server', () => ({ connection: async () => {} }));
vi.mock('@/lib/settings/site', () => ({
  getSiteSettings: async () => ({
    publicUrl: 'https://mimir.example.test',
    siteName: 'Mimir',
    metaDescription: 'Long-term memory for your agents.',
  }),
}));

const { default: AgentPage } = await import('./agents/[agent]/page');

describe('agent page', () => {
  beforeEach(() => {
    mocks.notFound.mockReset();
    mocks.notFound.mockImplementation(() => {
      throw new Error('NEXT_NOT_FOUND');
    });
  });

  it('renders the codex config', async () => {
    const html = renderToStaticMarkup(await AgentPage({ params: Promise.resolve({ agent: 'codex' }) }));
    expect(html).toContain('config.toml');
    expect(html).toContain('[mcp_servers.mimir]');
    expect(html).toContain('memory_digest');
    expect(html).toContain('https://mimir.example.test/mcp');
  });

  it('renders the opencode config as json', async () => {
    const html = renderToStaticMarkup(await AgentPage({ params: Promise.resolve({ agent: 'opencode' }) }));
    expect(html).toContain('opencode.json');
    expect(html).toContain('&quot;type&quot;: &quot;remote&quot;');
  });

  it('404s an unknown agent', async () => {
    await expect(AgentPage({ params: Promise.resolve({ agent: 'nope' }) })).rejects.toThrow('NEXT_NOT_FOUND');
  });
});
