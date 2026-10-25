import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/headers', () => ({
  cookies: async () => ({ get: () => undefined }),
  headers: async () => new Headers(),
}));
vi.mock('@/lib/auth/context', () => ({
  getCurrentUser: async () => ({ id: 'u1', email: 'a@b.test', locale: 'da' }),
}));

import SetPasswordPage from './[token]/page';

describe('the set-password page', () => {
  it('renders the form for a token without consuming it', async () => {
    const html = renderToStaticMarkup(
      await SetPasswordPage({ params: Promise.resolve({ token: 'a-token-value' }) }),
    );

    expect(html).toContain('Vælg en adgangskode');
    expect(html).toContain('name="password"');
    expect(html).toContain('a-token-value');
  });
});
