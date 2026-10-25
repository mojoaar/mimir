export const LOCALES = ['en', 'da', 'de'] as const;
export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = 'en';
export const LOCALE_COOKIE = 'mimir_locale';

export function isLocale(value: string): value is Locale {
  return (LOCALES as readonly string[]).includes(value);
}

/** The first language tag we speak, ignoring the quality weights browsers order by. */
export function fromAcceptLanguage(header: string | null): Locale | null {
  if (!header) return null;
  for (const part of header.split(',')) {
    const tag = part.split(';')[0]?.trim().toLowerCase().slice(0, 2) ?? '';
    if (isLocale(tag)) return tag;
  }
  return null;
}

/**
 * Splits `/da/x` into a locale and the path it decorates. English is the
 * default and is served unprefixed, so `/en/x` is reported with `rest: '/x'`
 * and the proxy redirects it away rather than serving a second copy.
 */
export function localeFromPath(pathname: string): { locale: Locale; rest: string } | null {
  const [head, ...tail] = pathname.split('/').filter(Boolean);
  if (head === undefined) return { locale: DEFAULT_LOCALE, rest: '/' };
  if (!isLocale(head)) return null;
  return { locale: head, rest: `/${tail.join('/')}`.replace(/\/$/, '') || '/' };
}

export function withLocale(path: string, locale: Locale): string {
  const clean = path.startsWith('/') ? path : `/${path}`;
  if (locale === DEFAULT_LOCALE) return clean;
  return clean === '/' ? `/${locale}` : `/${locale}${clean}`;
}

/** Only the landing page is localised; product and docs paths never are. */
export function isMarketingPath(pathname: string): boolean {
  const parsed = localeFromPath(pathname);
  if (parsed === null) return false;
  return parsed.rest === '/';
}

export function localeAlternates(path: string): Record<string, string> {
  return {
    en: withLocale(path, 'en'),
    da: withLocale(path, 'da'),
    de: withLocale(path, 'de'),
    'x-default': withLocale(path, 'en'),
  };
}
