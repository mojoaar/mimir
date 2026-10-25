'use client';

import { useState } from 'react';

export function Code({ language, children }: { language?: string; children: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(children);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard access can be denied; the text stays selectable.
    }
  }

  return (
    <div className="relative my-4 overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--bg-sunken)]">
      <div className="flex items-center justify-between border-b border-[var(--border)] px-3 py-1.5">
        <span className="font-mono text-xs uppercase tracking-wide text-[var(--text-muted)]">
          {language ?? 'text'}
        </span>
        <button
          type="button"
          onClick={copy}
          className="rounded px-2 py-0.5 text-xs text-[var(--text-muted)] hover:text-[var(--fg)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
        >
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre className="overflow-x-auto p-3 text-sm leading-relaxed">
        <code className="font-mono text-[var(--fg)]">{children}</code>
      </pre>
    </div>
  );
}
