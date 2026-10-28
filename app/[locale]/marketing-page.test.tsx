import { describe, expect, test, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

vi.mock('next/headers', () => ({
  cookies: async () => ({ get: () => undefined }),
}));

vi.mock('@/lib/settings/site', () => ({
  getSiteSettings: async () => ({
    publicUrl: 'https://mimir.example.test',
    siteName: 'Mimir',
    metaDescription: 'Long-term memory for your agents.',
  }),
}));

vi.mock('@/lib/auth/context', () => ({
  getCurrentUser: async () => session.user,
}));

const session = vi.hoisted(() => ({ user: null as null | { id: string } }));

import { t } from '@/lib/i18n';
import MarketingPage from './page';

const page = (locale: string) => MarketingPage({ params: Promise.resolve({ locale }) });

describe('the marketing page', () => {
  test('renders in danish', async () => {
    const html = renderToStaticMarkup(await page('da'));
    expect(html).toContain(t('da', 'hero.headline'));
    expect(html).not.toContain(t('en', 'hero.headline'));
  });

  test('keeps its own footer and does not stack the app footer on top', async () => {
    const html = renderToStaticMarkup(await page('en'));
    expect(html.match(/<footer/g)?.length ?? 0).toBe(1);
    expect(html).not.toContain('Crafted with');
  });

  test('renders in german', async () => {
    const html = renderToStaticMarkup(await page('de'));
    expect(html).toContain(t('de', 'hero.headline'));
  });

  test('offers a way into the app from the header and the closing call to action', async () => {
    const html = renderToStaticMarkup(await page('en'));

    expect(html.match(/href="\/app"/g)?.length).toBeGreaterThanOrEqual(2);
    expect(html).toContain(t('en', 'hero.signIn'));
    // The theme lives in the app now; the landing has one job.
    expect(html).not.toContain('Theme');
  });

  test('opens by saying what is wrong and how long the fix takes', async () => {
    const html = renderToStaticMarkup(await page('en'));

    expect(html).toContain(t('en', 'hero.headline'));
    expect(html).toContain(t('en', 'hero.chip1'));
    expect(html).toContain(t('en', 'hero.dockerLabel'));
    expect(html).toContain(t('en', 'cta.title'));
  });

  test('shows the commands that actually start it, not just the last one', async () => {
    const html = renderToStaticMarkup(await page('en'));

    expect(html).toContain('git clone https://github.com/mojoaar/mimir');
    expect(html).toContain('cp .env.example .env');
    expect(html).toContain('docker compose up -d');
    expect(html).toContain('one secret, two passwords');
  });

  test('says how to connect an agent once it is running', async () => {
    const html = renderToStaticMarkup(await page('en'));

    expect(html).toContain(t('en', 'start.agent'));
    expect(html).toContain('href="/docs/agents"');
    expect(t('en', 'start.agent')).toContain('OpenCode plugin');
  });

  test('names the entry point for someone already signed in', async () => {
    session.user = { id: 'u1' };
    const html = renderToStaticMarkup(await page('en'));
    session.user = null;

    expect(html).toContain(t('en', 'hero.openApp'));
    expect(html).not.toContain(t('en', 'hero.signIn'));
  });

  test('shows an agent using Mimir over mcp', async () => {
    const html = renderToStaticMarkup(await page('en'));

    expect(html).toContain('memory_digest');
    expect(html).toContain('memory_search');
    expect(html).toContain('Connected');
  });

  test('publishes structured data without a localhost url', async () => {
    const html = renderToStaticMarkup(await page('en'));
    expect(html).toContain('application/ld+json');
    expect(html).toContain('"@type":"SoftwareApplication"');
    // The quick start card does say localhost, because that is where compose
    // leaves you; the claim that matters is the public URL in the metadata.
    const start = html.indexOf('application/ld+json');
    const jsonLd = html.slice(start, html.indexOf('</script>', start));
    expect(jsonLd).not.toContain('localhost');
  });

  test('explains the name, the session, the providers and the data', async () => {
    const html = renderToStaticMarkup(await page('en'));

    for (const heading of [
      'Why Mimir',
      'How a session goes',
      'Two providers, two jobs',
      'Your box, your data',
    ]) {
      expect(html).toContain(heading);
    }
    expect(html).toContain('Odin traded an eye');
    expect(html).toContain('768');
  });

  test('says why in danish too', async () => {
    expect(renderToStaticMarkup(await page('da'))).toContain('Hvorfor Mimir');
  });

  test('admits that pageviews can leave the box', async () => {
    const html = renderToStaticMarkup(await page('en'));

    // The privacy paragraph promised that nothing leaves without a provider.
    // Analytics broke that promise quietly, so the sentence names it.
    expect(html).toContain('Umami');
  });
});
