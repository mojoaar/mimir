import type { ReactNode } from 'react';

const TONE = {
  note: 'border-[var(--border)] bg-[var(--bg-raised)]',
  tip: 'border-[var(--accent)] bg-[var(--bg-raised)]',
  warning: 'border-[var(--danger)] bg-[var(--bg-raised)]',
} as const;

const LABEL = { note: 'Note', tip: 'Tip', warning: 'Warning' } as const;

export function Callout({ kind = 'note', children }: { kind?: keyof typeof TONE; children: ReactNode }) {
  return (
    <aside className={`my-4 rounded-lg border-l-4 px-4 py-3 ${TONE[kind]}`}>
      <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-[var(--fg)]">
        {LABEL[kind]}
      </p>
      <div className="text-sm text-[var(--text-muted)]">{children}</div>
    </aside>
  );
}
