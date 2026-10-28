/**
 * The command block at the end of the landing page, drawn in the same chrome as
 * the session mock so the two read as one page. Three commands, not one: compose
 * needs a file to read and a secret plus two passwords in .env, so a bare
 * `docker compose up -d` on a fresh machine fails.
 *
 * The commands are English on purpose, like the session mock: this is a code
 * sample, not interface copy.
 */
const LINES = [
  { command: 'git clone https://github.com/mojoaar/mimir && cd mimir' },
  { command: 'cp .env.example .env', comment: '# one secret, two passwords' },
  { command: 'docker compose up -d' },
]

export function QuickStart() {
  const dot = (color: string) => (
    <span className="h-2.5 w-2.5 rounded-full" style={{ background: color }} aria-hidden="true" />
  )

  return (
    <figure
      aria-label="Three commands: clone the repository, copy the environment file, start the stack."
      className="overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--bg-sunken)] shadow-sm"
    >
      <div className="flex items-center gap-2 border-b border-[var(--border)] px-3 py-1.5">
        <span className="flex gap-1.5">
          {dot('#ff5f57')}
          {dot('#febc2e')}
          {dot('#28c840')}
        </span>
        <span className="truncate font-mono text-[10px] text-[var(--text-muted)]">mimir</span>
      </div>

      <pre className="overflow-x-auto px-3 py-2.5 font-mono text-xs leading-relaxed">
        <code>
          {LINES.map((line) => (
            <span key={line.command} className="block whitespace-pre">
              <span className="select-none text-[var(--accent)]">$ </span>
              {line.command}
              {line.comment ? (
                <span className="text-[var(--text-muted)]">
                  {'  '}
                  {line.comment}
                </span>
              ) : null}
            </span>
          ))}
        </code>
      </pre>

      <div className="flex items-center justify-between gap-3 border-t border-[var(--border)] px-3 py-1.5 font-mono text-[10px] text-[var(--text-muted)]">
        <span>~/mimir</span>
        <span>http://localhost:3000</span>
      </div>
    </figure>
  )
}

/** The plugin path in one line, for the readers who run OpenCode. English: a command, not copy. */
export function PluginInstall() {
  return (
    <pre className="w-fit max-w-full overflow-x-auto rounded-md border border-[var(--border)] bg-[var(--bg-sunken)] px-3 py-2 font-mono text-xs">
      <code>
        <span className="select-none text-[var(--accent)]">$ </span>
        opencode plugin add @mojoaar/opencode-mimir
      </code>
    </pre>
  )
}
