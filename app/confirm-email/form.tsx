'use client';

import { useEffect, useState } from 'react';
import { useActionState } from 'react';

import { confirmEmailAction, type ConfirmState } from './actions';

const EMPTY: ConfirmState = {};

/**
 * The token travels in the fragment, so it never reaches the server log. A
 * link with no fragment is treated as expired instead of submitting nothing.
 * The button is deliberate: a mail scanner that opens the link must not spend
 * the token before the person does.
 */
export function ConfirmEmailForm({ labels }: { labels: { submit: string; invalid: string } }) {
  const [token, setToken] = useState('');
  const [state, action, pending] = useActionState(confirmEmailAction, EMPTY);

  useEffect(() => {
    // The token is only known in the browser, so the read must happen after mount.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setToken(window.location.hash.slice(1));
  }, []);

  if (state.ok) {
    return <p className="text-sm text-[var(--accent)]">{state.ok}</p>;
  }

  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="token" value={token} />
      {token === '' ? (
        <p role="alert" className="text-sm text-[var(--danger)]">
          {labels.invalid}
        </p>
      ) : null}
      {state.error ? (
        <p role="alert" className="text-sm text-[var(--danger)]">
          {state.error}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={pending || token === ''}
        className="rounded-md bg-[var(--accent)] px-3 py-2 text-sm font-medium text-[var(--accent-fg)] disabled:opacity-60"
      >
        {labels.submit}
      </button>
    </form>
  );
}
