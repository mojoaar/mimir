import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

vi.mock('next/server', () => ({ connection: async () => {} }));

vi.mock('next/headers', () => ({
  cookies: async () => ({ get: () => ({ value: 'nordlys-dark' }) }),
}));

vi.mock('@/lib/settings/site', () => ({
  getPublicUrl: async () => 'https://mimir.example.test',
  getSiteSettings: async () => ({
    publicUrl: 'https://mimir.example.test',
    siteName: 'Mimir',
    metaDescription: 'Long-term memory for your agents.',
  }),
}));

import DocsLayout from './layout';
import DocsIndex from './page';
import { DOCS_NAV } from '@/lib/docs/nav';

describe('the docs shell', () => {
  it('lists every nav group and the load-bearing links', async () => {
    const html = renderToStaticMarkup(
      await DocsLayout({ children: <p>content</p> }),
    );

    for (const group of DOCS_NAV) {
      expect(html).toContain(group.title);
    }
    expect(html).toContain('href="/docs/mcp"');
    expect(html).toContain('href="/docs/agents/opencode"');
  });

  it('renders a disclosure for small screens', async () => {
    const html = renderToStaticMarkup(await DocsLayout({ children: <p>content</p> }));
    expect(html).toContain('<details');
  });

  it('makes the index indexable with a canonical url', async () => {
    const { generateMetadata } = await import('./page');
    const meta = await generateMetadata();
    expect(meta.alternates?.canonical).toBe('https://mimir.example.test/docs');
    expect(meta.robots).not.toMatchObject({ index: false });
    expect(JSON.stringify(meta)).toContain('canonical');
  });
});
