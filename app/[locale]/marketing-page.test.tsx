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

  test('publishes structured data without a localhost url', async () => {
    const html = renderToStaticMarkup(await page('en'));
    expect(html).toContain('application/ld+json');
    expect(html).toContain('"@type":"SoftwareApplication"');
    expect(html).not.toContain('localhost');
  });
});
