import { describe, expect, test, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

vi.mock('next/server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/server')>()),
  connection: async () => {},
}));

vi.mock('next/headers', () => ({
  cookies: async () => ({ get: () => undefined }),
}));

vi.mock('@/lib/settings/site', () => ({
  getSiteSettings: async () => ({
    publicUrl: 'https://mimir.example.test',
    siteName: 'Mimir',
    metaDescription: 'Long-term memory for your agents.',
  }),
  getPublicUrl: async () => 'https://mimir.example.test',
}));

vi.mock('@/lib/settings/time', () => ({
  getTimeFormat: async () => ({ timeZone: 'UTC', clock: '24h' }),
}));

vi.mock('@/lib/auth/context', () => ({
  getCurrentUser: async () => session.user,
}));

const session = vi.hoisted(() => ({ user: null as null | { id: string } }));

import { t } from '@/lib/i18n';
import { AGENTS } from '@/lib/docs/agents';
import { TOOL_NAMES } from '@/lib/mcp/tools';
import MarketingPage, { generateMetadata } from './page';

const page = (locale: string) => MarketingPage({ params: Promise.resolve({ locale }) });

describe('the marketing page', () => {
  test('renders in danish', async () => {
    const html = renderToStaticMarkup(await page('da'));
    expect(html).toContain('Dine agenter glemmer alt.');
    expect(html).toContain('minutter.');
    expect(html).not.toContain('Your agents forget everything.');
  });

  test('keeps its own footer and does not stack the app footer on top', async () => {
    const html = renderToStaticMarkup(await page('en'));
    expect(html.match(/<footer/g)?.length ?? 0).toBe(1);
    expect(html).not.toContain('Crafted with');
  });

  test('keeps one text measure, so a heading and its paragraph line up', async () => {
    const html = renderToStaticMarkup(await page('en'));

    // The page used to stop at 976, 768 and 672 pixels in the same column,
    // which read as three different layouts rather than one.
    expect(html).not.toContain('max-w-2xl');
    expect((html.match(/max-w-3xl/g) ?? []).length).toBeGreaterThan(10);
  });

  test('offers a light or dark switch in the header', async () => {
    session.user = null;
    const html = renderToStaticMarkup(await page('en'));

    // The cookie defaults to nordlys-dark, so the first press offers light.
    expect(html).toContain('aria-label="Switch to the light theme"');
  });

  test('renders in german', async () => {
    const html = renderToStaticMarkup(await page('de'));
    expect(html).toContain('Deine Agenten vergessen alles.');
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

    // The number is wrapped in an accent span, so the sentence is asserted in
    // two halves: the words either side of it.
    expect(html).toContain('Your agents forget everything. Fix that in');
    expect(html).toContain('minutes.');
    expect(html).toContain(
      '<span class="text-[var(--accent)]">' + t('en', 'hero.headlineAccent') + '</span>',
    );
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
    expect(html).toContain('opencode plugin add @mojoaar/opencode-mimir');
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

  test('sets the reason in a panel, with the eye behind it', async () => {
    const html = renderToStaticMarkup(await page('en'));

    // The myth is the only illustrated block, so it is the only one with a mark.
    expect(html).toContain('viewBox="0 0 240 240"');
    expect(html).toContain('An eye for one draught');
    expect(html).toContain('Odin traded an eye');
  });

  test('names the clients and puts the numbers in a row', async () => {
    const html = renderToStaticMarkup(await page('en'));

    expect(html).toContain('Claude Code');
    expect(html).toContain('Oh My Pi');
    // Figure and label are separate elements, so match the figure itself.
    expect(html).toContain(`>${AGENTS.length}</dd>`);
    expect(html).toContain(`>${TOOL_NAMES.length}</dd>`);
    // The word "plugin" in the label carries the accent, so the row's claim
    // and the chips it points at are the same colour.
    expect(html).toContain('>plugin</span>');
    expect(html).toContain('clients');
  });

  test('shows the digest an agent wakes up to, dated today', async () => {
    const html = renderToStaticMarkup(await page('en'));
    const day = new Date().toISOString().slice(0, 10);

    expect(html).toContain('deploy/rollback');
    expect(html).toContain('[gotcha]');
    expect(html).toContain(day);
  });

  test('offers three ways to connect, each with its own command', async () => {
    const html = renderToStaticMarkup(await page('en'));

    expect(html).toContain('opencode plugin add @mojoaar/opencode-mimir');
    expect(html).toContain('omp plugin install @mojoaar/omp-mimir');
    expect(html).toContain('/mcp');
    expect(html).toContain('Any MCP client');
  });

  test('shows one search reaching every project', async () => {
    const html = renderToStaticMarkup(await page('en'));

    expect(html).toContain('rotate the signing keys');
    expect(html).toContain('github.com/mojoaar/mimir');
  });

  test('says what else is in it, and what it is not', async () => {
    const html = renderToStaticMarkup(await page('en'));

    expect(html).toContain('Audit and cost');
    expect(html).toContain('Backups and versions');
    expect(html).toContain('Teams and grants');
    expect(html).toContain('no per-seat licence');
  });

  test('keeps the hero wash behind the text and out of the accessibility tree', async () => {
    const html = renderToStaticMarkup(await page('en'));

    expect(html).toContain('radial-gradient(60% 55% at 30% 30%');
    expect(html).toContain('--hero-glow');
    // Without the mask the gradient is still lit where the box ends, which
    // draws a faint rectangle at the hero's left, top and bottom edges.
    expect(html).toContain('closest-side');
    expect(html).toMatch(/aria-hidden="true"[^>]*style="[^"]*radial-gradient/);
  });

  test('still sends the whole digest, even though it types', async () => {
    const html = renderToStaticMarkup(await page('en'));

    // The card types itself in the browser, so the server has to carry the
    // finished text for a reader without JavaScript and for a crawler.
    expect(html).toContain('## What this project already knows (Mimir)');
    expect(html).toContain('The Unreleased heading does not survive a release rename');
  });

  test('names the providers it actually ships, by job', async () => {
    const html = renderToStaticMarkup(await page('en'));

    expect(html).toContain('Language model');
    expect(html).toContain('DeepSeek');
    expect(html).toContain('Octen');
    expect(html).toContain('Mistral');
  });

  test('takes its title from the site settings, not the catalogue', async () => {
    const meta = await generateMetadata({ params: Promise.resolve({ locale: 'en' }) });

    // Both halves are Admin -> Settings -> Site: the name, then the description.
    expect(meta.title).toBe('Mimir | Long-term memory for your agents.');
  });
});
