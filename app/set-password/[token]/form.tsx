'use client';

import { useActionState } from 'react';

import { setPasswordAction, type PasswordState } from './actions';

const initial: PasswordState = {};

export type PasswordLabels = { label: string; submit: string; pending: string };

export function PasswordForm({ token, labels }: { token: string; labels: PasswordLabels }) {
  const [state, action, pending] = useActionState(setPasswordAction, initial);

  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="token" value={token} />
      <label className="flex flex-col gap-1 text-sm">
        <span>{labels.label}</span>
        <input
          type="password"
          name="password"
          required
          minLength={12}
          autoComplete="new-password"
          className="rounded border border-[var(--border)] bg-[var(--bg-raised)] px-3 py-2"
        />
      </label>
      {state.error ? (
        <p role="alert" className="text-sm text-[var(--danger)]">
          {state.error}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={pending}
        className="rounded bg-[var(--accent)] px-4 py-2 font-medium text-[var(--accent-fg)] disabled:opacity-60"
      >
        {pending ? labels.pending : labels.submit}
      </button>
    </form>
  );
}
