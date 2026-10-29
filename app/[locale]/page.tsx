import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getSiteSettings, getPublicUrl } from '@/lib/settings/site';
import { isLocale, localeAlternates, t, withLocale, type Locale } from '@/lib/i18n';
import { connection } from 'next/server';
import { getCurrentUser } from '@/lib/auth/context';
import { MimirTerminal } from './terminal';
import { QuickStart } from './quick-start';
import { ClientStrip, DigestCard, ProviderChips, SearchMock, StatStrip, WhyMark } from './showcase';
import { Logo } from '@/app/logo'
import { ThemeToggle } from '@/app/theme-toggle'
import { cookies } from 'next/headers'
import { parseTheme, THEME_COOKIE } from '@/lib/theme'
import { getTimeFormat } from '@/lib/settings/time'

/**
 * The number is the promise, so it takes the accent colour. Which word it is
 * differs by language, so the catalogue names it rather than a split here.
 */
function headline(locale: Locale) {
  const text = t(locale, 'hero.headline');
  const accent = t(locale, 'hero.headlineAccent');
  const at = text.indexOf(accent);
  if (at === -1) return text;
  return (
    <>
      {text.slice(0, at)}
      <span className="text-[var(--accent)]">{accent}</span>
      {text.slice(at + accent.length)}
    </>
  );
}

export const instant = false;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  await connection();
  const { locale: raw } = await params;
  const locale: Locale = isLocale(raw) ? raw : 'en';
  const [site, origin] = await Promise.all([getSiteSettings(), getPublicUrl()]);
  const base = origin.replace(/\/+$/, '');
  const path = withLocale('/', locale);
  const title = t(locale, 'hero.title');
  const description = t(locale, 'hero.subtitle');
  return {
    metadataBase: new URL(base),
    title,
    description,
    alternates: {
      canonical: `${base}${path === '/' ? '' : path}`,
      languages: Object.fromEntries(
        Object.entries(localeAlternates('/')).map(([key, value]) => [
          key,
          `${base}${value === '/' ? '' : value}`,
        ]),
      ),
    },
    openGraph: {
      type: 'website',
      siteName: site.siteName,
      title: `${site.siteName} - ${title}`,
      description,
      url: `${base}${path === '/' ? '' : path}`,
      images: [{ url: `${base}/opengraph-image`, width: 1200, height: 630 }],
    },
    twitter: { card: 'summary_large_image' },
  };
}

export default async function MarketingPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: raw } = await params;
  if (!isLocale(raw)) notFound();
  const locale: Locale = raw;
  const [site, user, theme, { timeZone }] = await Promise.all([
    getSiteSettings(),
    getCurrentUser(),
    cookies().then((jar) => parseTheme(jar.get(THEME_COOKIE)?.value)),
    getTimeFormat(),
  ]);
  // The same link, named for what it does: enter the app, or sign in first.
  const entry = t(locale, user ? 'hero.openApp' : 'hero.signIn');

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: site.siteName,
    applicationCategory: 'DeveloperApplication',
    operatingSystem: 'Linux, macOS',
    description: t(locale, 'hero.subtitle'),
    license: 'https://opensource.org/licenses/MIT',
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
  };

  const primary =
    'rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-medium text-[var(--accent-fg)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]';
  const secondary =
    'rounded-md border border-[var(--border)] px-4 py-2 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]';

  return (
    <div lang={locale} className="mx-auto flex min-h-screen w-full max-w-5xl flex-col px-4 sm:px-6">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <header className="flex flex-wrap items-center justify-between gap-3 py-6">
        <span className="flex items-center gap-2 text-lg font-semibold tracking-tight">
          <Logo className="h-7 w-7" />
          {site.siteName}
        </span>
        <nav className="flex items-center gap-4 text-sm">
          <a className="text-[var(--text-muted)] hover:text-[var(--fg)]" href="/docs">
            {t(locale, 'hero.docs')}
          </a>
          <a
            className="text-[var(--text-muted)] hover:text-[var(--fg)]"
            href="https://github.com/mojoaar/mimir"
          >
            {t(locale, 'hero.github')}
          </a>
          <ThemeToggle value={theme} />
          <a className={secondary} href="/app">
            {entry}
          </a>
        </nav>
      </header>

      <main className="flex flex-1 flex-col gap-16 py-10 sm:py-16">
        <section className="relative isolate flex flex-col gap-6 border-b border-[var(--border)] pb-8">
          {/* The accent, very low, well behind the headline. It reads as depth
              rather than decoration, and the light themes need less of it. The
              mask is what keeps the wash off the section edges: a radial that
              is still faintly lit when the box ends draws its own rectangle. */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 -z-10"
            style={{
              backgroundImage: 'radial-gradient(60% 55% at 30% 30%, var(--accent) 0%, transparent 70%)',
              opacity: 'var(--hero-glow)',
              maskImage: 'radial-gradient(closest-side, #000 45%, transparent 100%)',
              WebkitMaskImage: 'radial-gradient(closest-side, #000 45%, transparent 100%)',
            }}
          />
          <p className="max-w-3xl text-xs font-semibold uppercase tracking-[0.2em] text-[var(--accent)]">
            {t(locale, 'hero.eyebrow')}
          </p>
          <h1 className="max-w-3xl text-4xl font-semibold leading-[1.05] tracking-tight sm:text-6xl">
            {headline(locale)}
          </h1>
          <p className="max-w-3xl text-base leading-relaxed text-[var(--text-muted)] sm:text-lg">
            {t(locale, 'hero.lead')}
          </p>
          <ul className="flex flex-wrap gap-2 text-xs">
            {(['hero.chip1', 'hero.chip2', 'hero.chip3'] as const).map((key) => (
              <li
                key={key}
                className="rounded-full border border-[var(--border)] px-3 py-1 text-[var(--text-muted)]"
              >
                {t(locale, key)}
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap items-center gap-3">
            <a href="/app" className={primary}>
              {entry}
            </a>
            <a href="/docs" className={secondary}>
              {t(locale, 'hero.docs')}
            </a>
          </div>
          <MimirTerminal />
          <ClientStrip
            title={t(locale, 'clients.title')}
            accent={t(locale, 'clients.titleAccent')}
          />
        </section>

        <StatStrip
          labels={{
            container: t(locale, 'stats.container'),
            mcp: t(locale, 'stats.mcp'),
            plugin: t(locale, 'stats.plugin'),
            clients: t(locale, 'stats.clients'),
          }}
        />

        <section className="relative overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--bg-raised)] p-6 sm:p-10">
          {/* The eye bleeds off the corner, so it reads as a watermark rather
              than a logo someone placed. */}
          <WhyMark className="pointer-events-none absolute -right-14 -top-16 w-[300px] text-[var(--accent)] opacity-[0.09]" />
          <div className="relative flex flex-col gap-5">
            <p className="max-w-3xl text-xs font-semibold uppercase tracking-[0.2em] text-[var(--accent)]">
              {t(locale, 'why.title')}
            </p>
            <h2 className="max-w-3xl text-3xl font-semibold leading-tight tracking-tight sm:text-4xl">
              {t(locale, 'why.headline')}
            </h2>
            <div className="grid max-w-3xl gap-5 sm:grid-cols-2">
              <p className="text-base leading-relaxed text-[var(--text-muted)]">{t(locale, 'why.p1')}</p>
              <p className="text-sm leading-relaxed text-[var(--text-muted)]">{t(locale, 'why.p2')}</p>
            </div>
          </div>
        </section>

        <section className="flex flex-col gap-6">
          <h2 className="max-w-3xl text-xl font-semibold tracking-tight">{t(locale, 'features.title')}</h2>
          <div className="grid gap-4 sm:grid-cols-3">
            {(
              [
                ['features.path.title', 'features.path.body'],
                ['features.api.title', 'features.api.body'],
                ['features.private.title', 'features.private.body'],
                ['features.audit.title', 'features.audit.body'],
                ['features.backup.title', 'features.backup.body'],
                ['features.team.title', 'features.team.body'],
              ] as const
            ).map(([heading, body]) => (
              <article
                key={heading}
                className="rounded-md border border-[var(--border)] bg-[var(--bg-raised)] p-4"
              >
                <h3 className="mb-2 font-medium">{t(locale, heading)}</h3>
                <p className="text-sm leading-relaxed text-[var(--text-muted)]">{t(locale, body)}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="flex flex-col gap-4">
          <h2 className="max-w-3xl text-xl font-semibold tracking-tight">{t(locale, 'session.title')}</h2>
          <ol className="flex max-w-3xl list-decimal flex-col gap-3 pl-5 text-sm leading-relaxed text-[var(--text-muted)]">
            {(['session.s1', 'session.s2', 'session.s3', 'session.s4'] as const).map((key) => {
              // Each line leads with its verb, so the reader can scan the four
              // steps without reading the sentences.
              const [lead, ...rest] = t(locale, key).split('. ')
              return (
                <li key={key}>
                  <strong className="text-[var(--fg)]">{lead}.</strong> {rest.join('. ')}
                </li>
              )
            })}
          </ol>
          <p className="max-w-3xl pt-2 text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
            {t(locale, 'digest.title')}
          </p>
          <DigestCard timeZone={timeZone} />
          <p className="max-w-3xl text-sm leading-relaxed text-[var(--text-muted)]">
            {t(locale, 'digest.body')}
          </p>
        </section>

        <section className="flex flex-col gap-4">
          <h2 className="max-w-3xl text-xl font-semibold tracking-tight">{t(locale, 'search.title')}</h2>
          <p className="max-w-3xl text-sm leading-relaxed text-[var(--text-muted)]">
            {t(locale, 'search.body')}
          </p>
          <SearchMock />
        </section>

        <section className="rounded-xl border border-[var(--border)] bg-[var(--bg-raised)] p-6 sm:p-10">
          <div className="flex flex-col gap-5">
            <h2 className="max-w-3xl text-3xl font-semibold tracking-tight sm:text-4xl">
              {t(locale, 'providers.title')}
            </h2>
            <div className="grid max-w-3xl gap-4 sm:grid-cols-2">
              {(
                [
                  ['providers.llmTitle', 'providers.llm', 'llm'],
                  ['providers.embedTitle', 'providers.embed', 'embedding'],
                ] as const
              ).map(([heading, body, kind]) => (
                <article
                  key={heading}
                  className="flex flex-col gap-3 rounded-md border border-[var(--border)] bg-[var(--bg-sunken)] p-4"
                >
                  <h3 className="text-sm font-medium">{t(locale, heading)}</h3>
                  <p className="text-sm leading-relaxed text-[var(--text-muted)]">{t(locale, body)}</p>
                  <ProviderChips kind={kind} />
                </article>
              ))}
            </div>
            <p className="max-w-3xl text-sm leading-relaxed text-[var(--accent)]">
              {t(locale, 'providers.optional')}
            </p>
          </div>
        </section>

        <section className="flex flex-col gap-4">
          <h2 className="max-w-3xl text-xl font-semibold tracking-tight">{t(locale, 'data.title')}</h2>
          <p className="max-w-3xl text-sm leading-relaxed text-[var(--text-muted)]">
            {t(locale, 'data.body')}
          </p>
          <p className="max-w-3xl text-sm leading-relaxed text-[var(--accent)]">
            {t(locale, 'data.contrast')}
          </p>
        </section>

        <section className="flex flex-col gap-3 rounded-lg border border-[var(--border)] bg-[var(--bg-raised)] p-6">
          <h2 className="max-w-3xl text-xl font-semibold tracking-tight">{t(locale, 'cta.title')}</h2>
          <p className="max-w-3xl text-sm leading-relaxed text-[var(--text-muted)]">
            {t(locale, 'cta.body')}
          </p>
          <div className="flex flex-wrap items-center gap-3 pt-1">
            <a href="/app" className={primary}>
              {entry}
            </a>
            <a href="/docs" className={secondary}>
              {t(locale, 'hero.docs')}
            </a>
          </div>
          <div className="flex flex-col gap-2 pt-1">
            <p className="text-xs uppercase tracking-wide text-[var(--text-muted)]">
              {t(locale, 'hero.dockerLabel')}
            </p>
            <QuickStart />
          </div>
          <p className="max-w-3xl text-sm leading-relaxed text-[var(--text-muted)]">
            {t(locale, 'start.agent')}
          </p>
          <div className="flex flex-col gap-3 rounded-md border border-[var(--border)] p-4">
            <p className="text-xs uppercase tracking-wide text-[var(--text-muted)]">
              {t(locale, 'connect.title')}
            </p>
            {(
              [
                ['connect.opencode', 'opencode plugin add @mojoaar/opencode-mimir'],
                ['connect.mcp', 'https://mimir.example.com/mcp'],
                ['connect.omp', 'omp plugin install @mojoaar/omp-mimir'],
              ] as const
            ).map(([label, command]) => (
              <div key={label} className="flex flex-col gap-1">
                <p className="text-xs text-[var(--text-muted)]">{t(locale, label)}</p>
                <pre className="w-fit max-w-full overflow-x-auto rounded-md border border-[var(--border)] bg-[var(--bg-sunken)] px-3 py-2 font-mono text-xs">
                  <span className="select-none text-[var(--accent)]">$ </span>
                  {command}
                </pre>
              </div>
            ))}
            <p className="text-xs text-[var(--text-muted)]">{t(locale, 'connect.hint')}</p>
          </div>
          <a className="w-fit text-sm text-[var(--accent)] underline" href="/docs/agents">
            {t(locale, 'start.agentLink')} {'\u2192'}
          </a>
        </section>
      </main>

      <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--border)] py-6 text-sm text-[var(--text-muted)]">
        <span>{t(locale, 'footer.tagline')}</span>
        <span className="flex flex-wrap items-center gap-4">
          <span>{t(locale, 'footer.license')}</span>
          <a className="hover:text-[var(--fg)]" href="https://buymeacoffee.com/mojoaar">
            {t(locale, 'footer.support')}
          </a>
          <span className="flex gap-2">
            <a className="hover:text-[var(--fg)]" href="/" hrefLang="en">
              EN
            </a>
            <a className="hover:text-[var(--fg)]" href="/da" hrefLang="da">
              DA
            </a>
            <a className="hover:text-[var(--fg)]" href="/de" hrefLang="de">
              DE
            </a>
          </span>
        </span>
      </footer>
    </div>
  );
}
