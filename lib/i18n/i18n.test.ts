import { describe, expect, test } from 'vitest';
import {
  DEFAULT_LOCALE,
  isLocale,
  isMarketingPath,
  localeAlternates,
  localeFromPath,
  withLocale,
} from './locales';
import { t } from './index';

describe('locales', () => {
  test('recognises only the three locales', () => {
    expect(isLocale('da')).toBe(true);
    expect(isLocale('en-US')).toBe(false);
    expect(isLocale('')).toBe(false);
  });

  test('splits a locale prefix off a path', () => {
    expect(localeFromPath('/da/docs')).toEqual({ locale: 'da', rest: '/docs' });
    expect(localeFromPath('/docs')).toBeNull();
    expect(localeFromPath('/en')).toEqual({ locale: 'en', rest: '/' });
    expect(localeFromPath('/')).toEqual({ locale: DEFAULT_LOCALE, rest: '/' });
  });

  test('builds a locale path, leaving english unprefixed', () => {
    expect(withLocale('/x', 'en')).toBe('/x');
    expect(withLocale('/', 'de')).toBe('/de');
    expect(withLocale('/x', 'da')).toBe('/da/x');
  });

  test('only the marketing root is localised', () => {
    expect(isMarketingPath('/da')).toBe(true);
    expect(isMarketingPath('/de')).toBe(true);
    expect(isMarketingPath('/da/app')).toBe(false);
    expect(isMarketingPath('/api/health')).toBe(false);
    expect(isMarketingPath('/docs')).toBe(false);
  });

  test('translates, falling back to english and then the key', () => {
    expect(t('da', 'hero.title')).not.toBe(t('en', 'hero.title'));
    expect(t('da', 'missing.key')).toBe('missing.key');
  });

  test('builds hreflang alternates with an x-default', () => {
    expect(localeAlternates('/')).toEqual({
      en: '/',
      da: '/da',
      de: '/de',
      'x-default': '/',
    });
  });
});
