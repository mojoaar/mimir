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

describe('the marketing page', () => {
  test('renders in danish', async () => {
    const html = renderToStaticMarkup(await MarketingPage({ params: Promise.resolve({ locale: 'da' }), searchParams: Promise.resolve({}) }));
    expect(html).toContain(t('da', 'hero.title'));
    expect(html).not.toContain(t('en', 'hero.title'));
  });

  test('keeps its own footer and does not stack the app footer on top', async () => {
    const html = renderToStaticMarkup(
      await MarketingPage({ params: Promise.resolve({ locale: 'en' }), searchParams: Promise.resolve({}) }),
    );
    expect(html.match(/<footer/g)?.length ?? 0).toBe(1);
    expect(html).not.toContain('Crafted with');
  });

  test('renders in german', async () => {
    const html = renderToStaticMarkup(await MarketingPage({ params: Promise.resolve({ locale: 'de' }), searchParams: Promise.resolve({}) }));
    expect(html).toContain(t('de', 'hero.title'));
  });

  test('offers a way into the app from the header and the closing call to action', async () => {
    const html = renderToStaticMarkup(
      await MarketingPage({
        params: Promise.resolve({ locale: 'en' }),
        searchParams: Promise.resolve({}),
      }),
    );

    expect(html.match(/href="\/app"/g)?.length).toBeGreaterThanOrEqual(2);
    expect(html).toContain(t('en', 'hero.signIn'));
    // The theme lives in the app now; the landing has one job.
    expect(html).not.toContain('Theme');
  });

  test('the bold variant sells the same product with a different opening', async () => {
    const bold = renderToStaticMarkup(
      await MarketingPage({
        params: Promise.resolve({ locale: 'en' }),
        searchParams: Promise.resolve({ variant: 'b' }),
      }),
    );

    expect(bold).toContain(t('en', 'heroB.title'));
    expect(bold).not.toContain(t('en', 'hero.title'));
    expect(bold).toContain(t('en', 'heroB.chip1'));
    expect(bold).toContain(t('en', 'heroB.dockerLabel'));
    expect(bold).toContain(t('en', 'cta.title'));
  });

  test('publishes structured data without a localhost url', async () => {
    const html = renderToStaticMarkup(await MarketingPage({ params: Promise.resolve({ locale: 'en' }), searchParams: Promise.resolve({}) }));
    expect(html).toContain('application/ld+json');
    expect(html).toContain('"@type":"SoftwareApplication"');
    expect(html).not.toContain('localhost');
  });
});
