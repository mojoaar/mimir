import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getSiteSettings, getPublicUrl } from '@/lib/settings/site';
import { isLocale, localeAlternates, t, withLocale, type Locale } from '@/lib/i18n';
import { connection } from 'next/server';
import { MimirTerminal } from './terminal';

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
      title: `${site.siteName} — ${title}`,
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
  const site = await getSiteSettings();

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
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icon.svg" alt="" width={28} height={28} className="h-7 w-7" />
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
          <a className={secondary} href="/app">
            {t(locale, 'hero.signIn')}
          </a>
        </nav>
      </header>

      <main className="flex flex-1 flex-col gap-16 py-10 sm:py-16">
        <section className="flex flex-col gap-6 border-b border-[var(--border)] pb-12">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--accent)]">
            {t(locale, 'hero.eyebrow')}
          </p>
          <h1 className="max-w-3xl text-4xl font-semibold leading-[1.05] tracking-tight sm:text-6xl">
            {t(locale, 'hero.headline')}
          </h1>
          <p className="max-w-2xl text-base leading-relaxed text-[var(--text-muted)] sm:text-lg">
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
              {t(locale, 'hero.signIn')}
            </a>
            <a href="/docs" className={secondary}>
              {t(locale, 'hero.docs')}
            </a>
          </div>
          <MimirTerminal />
        </section>

        <section className="flex flex-col gap-6">
          <h2 className="text-xl font-semibold tracking-tight">{t(locale, 'features.title')}</h2>
          <div className="grid gap-4 sm:grid-cols-3">
            {(
              [
                ['features.path.title', 'features.path.body'],
                ['features.api.title', 'features.api.body'],
                ['features.private.title', 'features.private.body'],
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

        <section className="flex flex-col gap-3 rounded-lg border border-[var(--border)] bg-[var(--bg-raised)] p-6">
          <h2 className="text-xl font-semibold tracking-tight">{t(locale, 'cta.title')}</h2>
          <p className="max-w-2xl text-sm leading-relaxed text-[var(--text-muted)]">
            {t(locale, 'cta.body')}
          </p>
          <div className="flex flex-wrap items-center gap-3 pt-1">
            <a href="/app" className={primary}>
              {t(locale, 'hero.signIn')}
            </a>
            <a href="/docs" className={secondary}>
              {t(locale, 'hero.docs')}
            </a>
          </div>
          <div className="pt-1">
            <p className="mb-1 text-xs uppercase tracking-wide text-[var(--text-muted)]">
              {t(locale, 'hero.dockerLabel')}
            </p>
            <pre className="w-fit max-w-full overflow-x-auto rounded border border-[var(--border)] bg-[var(--bg-sunken)] px-3 py-2 text-sm">
              <code>{t(locale, 'hero.docker')}</code>
            </pre>
          </div>
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
