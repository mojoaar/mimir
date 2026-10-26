'use client';

import { useState } from 'react';
import { Highlight, type Language, type PrismTheme } from 'prism-react-renderer';

/**
 * Tokens take their colour from the theme variables, so highlighting works in
 * both themes without shipping a second palette or a global stylesheet.
 */
const COLOR: Record<string, string> = {
  comment: 'var(--text-muted)',
  prolog: 'var(--text-muted)',
  doctype: 'var(--text-muted)',
  cdata: 'var(--text-muted)',
  punctuation: 'var(--text-muted)',
  operator: 'var(--text-muted)',
  string: 'var(--accent)',
  'attr-value': 'var(--accent)',
  keyword: 'var(--accent)',
  builtin: 'var(--accent)',
  boolean: 'var(--accent)',
  number: 'var(--accent)',
  function: 'var(--fg)',
  'class-name': 'var(--fg)',
  property: 'var(--fg)',
  'attr-name': 'var(--fg)',
  tag: 'var(--fg)',
};

const HIGHLIGHTED = new Set(['bash', 'json', 'ts', 'typescript', 'js', 'javascript']);

/** No built-in palette: every colour comes from the CSS variables above. */
const THEME: PrismTheme = {
  plain: { color: 'var(--fg)', backgroundColor: 'transparent' },
  styles: [],
};

function colorFor(types: string[]): string | undefined {
  for (const type of types) {
    const color = COLOR[type];
    if (color) return color;
  }
  return undefined;
}

export function Code({ language, children }: { language?: string; children: string }) {
  const [copied, setCopied] = useState(false);
  const source = children.replace(/\n$/, '');

  async function copy() {
    try {
      await navigator.clipboard.writeText(source);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard access can be denied; the text stays selectable.
    }
  }

  const body = HIGHLIGHTED.has(language ?? '') ? (
    <Highlight code={source} language={language as Language} theme={THEME}>
      {({ tokens, getLineProps, getTokenProps }) => (
        <pre className="overflow-x-auto p-3 text-sm leading-relaxed">
          <code className="font-mono">
            {tokens.map((line, index) => (
              <div key={index} {...getLineProps({ line })}>
                {line.map((token, key) => {
                  const props = getTokenProps({ token });
                  const color = colorFor(token.types);
                  return (
                    <span
                      key={key}
                      {...props}
                      style={color ? { ...props.style, color } : props.style}
                    />
                  );
                })}
              </div>
            ))}
          </code>
        </pre>
      )}
    </Highlight>
  ) : (
    <pre className="overflow-x-auto p-3 text-sm leading-relaxed">
      <code className="font-mono text-[var(--fg)]">{source}</code>
    </pre>
  );

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
      {body}
    </div>
  );
}
