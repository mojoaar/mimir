'use client';

import { useEffect, useState } from 'react';

import { PasswordForm, type PasswordLabels } from './form';

/**
 * The token arrives in the fragment, which the browser never sends to the
 * server, so it cannot land in an access log. A link with no fragment is
 * treated as expired rather than submitting an empty token.
 */
export function HashPasswordForm({ labels, invalid }: { labels: PasswordLabels; invalid: string }) {
  const [token, setToken] = useState('');

  useEffect(() => {
    // The token is only known in the browser, so the read must happen after mount.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setToken(window.location.hash.slice(1));
  }, []);

  return (
    <div className="flex flex-col gap-4">
      {token === '' ? (
        <p role="alert" className="text-sm text-[var(--danger)]">
          {invalid}
        </p>
      ) : null}
      <PasswordForm token={token} labels={labels} />
    </div>
  );
}
