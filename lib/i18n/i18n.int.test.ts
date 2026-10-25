import { beforeEach, describe, expect, test, vi } from 'vitest';

const cookies = vi.hoisted(() => ({ value: '' }));
const headers = vi.hoisted(() => ({ value: '' }));

vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) => (name === 'mimir_locale' && cookies.value ? { value: cookies.value } : undefined),
  }),
  headers: async () => new Map([['accept-language', headers.value]]),
}));

import { getLocale } from './index';

describe('getLocale', () => {
  beforeEach(() => {
    cookies.value = '';
    headers.value = '';
  });

  test('prefers a valid cookie', async () => {
    cookies.value = 'da';
    expect(await getLocale()).toBe('da');
  });

  test('falls back to the accepted language', async () => {
    headers.value = 'de-DE,de;q=0.9,en;q=0.5';
    expect(await getLocale()).toBe('de');
  });

  test('defaults to english', async () => {
    expect(await getLocale()).toBe('en');
  });

  test('ignores an invalid cookie and uses the header', async () => {
    cookies.value = 'xx';
    headers.value = 'da';
    expect(await getLocale()).toBe('da');
  });
});
