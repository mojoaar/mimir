import { cookies, headers } from 'next/headers';
import { DEFAULT_LOCALE, LOCALE_COOKIE, isLocale, type Locale } from './locales';
import { en, type Messages } from './messages/en';
import { da } from './messages/da';
import { de } from './messages/de';

export { LOCALES, DEFAULT_LOCALE, LOCALE_COOKIE, isLocale, localeFromPath, withLocale, isMarketingPath, localeAlternates } from './locales';
export type { Locale } from './locales';
export type { Messages } from './messages/en';

export const MESSAGES: Record<Locale, Messages> = { en, da, de };

function lookup(messages: Messages, key: string): string | undefined {
  const direct = (messages as Record<string, unknown>)[key];
  if (typeof direct === 'string') return direct;
  const value = key
    .split('.')
    .reduce<unknown>((node, part) => (node as Record<string, unknown> | undefined)?.[part], messages);
  return typeof value === 'string' ? value : undefined;
}

/** Dotted lookup with an English fallback; a miss returns the key itself. */
export function t(locale: Locale, key: string): string {
  const hit = lookup(MESSAGES[locale], key) ?? lookup(en, key);
  if (hit !== undefined) return hit;
  if (process.env.NODE_ENV === 'development') {
    console.warn(`i18n: missing message "${key}" (${locale})`);
  }
  return key;
}

function fromAcceptLanguage(header: string | null): Locale | null {
  if (!header) return null;
  for (const part of header.split(',')) {
    const tag = part.split(';')[0]?.trim().toLowerCase().slice(0, 2) ?? '';
    if (isLocale(tag)) return tag;
  }
  return null;
}

export async function getLocale(): Promise<Locale> {
  const stored = (await cookies()).get(LOCALE_COOKIE)?.value ?? '';
  if (isLocale(stored)) return stored;
  return fromAcceptLanguage((await headers()).get('accept-language')) ?? DEFAULT_LOCALE;
}
