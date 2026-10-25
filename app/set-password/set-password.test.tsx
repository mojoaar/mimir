import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import SetPasswordPage from './[token]/page';

describe('the set-password page', () => {
  it('renders the form for a token without consuming it', async () => {
    const html = renderToStaticMarkup(
      await SetPasswordPage({ params: Promise.resolve({ token: 'a-token-value' }) }),
    );

    expect(html).toContain('Set a password');
    expect(html).toContain('name="password"');
    expect(html).toContain('a-token-value');
  });
});
