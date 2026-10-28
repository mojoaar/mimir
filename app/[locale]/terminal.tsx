/**
 * A mock of an OpenCode session, not a screenshot: the landing has to show what
 * Mimir does for an agent, and the agent lives in a TUI. English is intentional
 * - it is a code sample, like the docker command, not interface copy.
 */
export function MimirTerminal() {
  const dot = (color: string) => (
    <span className="h-2.5 w-2.5 rounded-full" style={{ background: color }} aria-hidden="true" />
  )

  return (
    <figure
      aria-label="An OpenCode session: the agent asks Mimir what the project already knows, searches it, and answers from the memory it found."
      className="overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--bg-sunken)] shadow-sm"
    >
      <div className="flex items-center gap-2 border-b border-[var(--border)] px-3 py-1.5">
        <span className="flex gap-1.5">
          {dot('#ff5f57')}
          {dot('#febc2e')}
          {dot('#28c840')}
        </span>
        <span className="font-mono text-[10px] text-[var(--text-muted)]">|</span>
        <span className="truncate text-xs">
          <span className="font-semibold">OC</span>{' '}
          <span className="text-[var(--text-muted)]">|</span> Mimir memory platform setup
        </span>
      </div>

      <div className="flex min-h-[20rem] text-xs">
        <aside className="hidden w-40 shrink-0 flex-col gap-3 border-r border-[var(--border)] p-3 sm:flex">
          <div>
            <p className="font-medium">Mimir memory platform setup</p>
            <p className="text-[10px] text-[var(--text-muted)]">mimir</p>
          </div>
          <p className="text-[var(--text-muted)]">+ New session</p>
        </aside>

        <div className="min-w-0 flex-1 space-y-2 overflow-hidden p-2">
          <div className="rounded-md border border-[var(--border)] bg-[var(--bg-raised)] px-2 py-1.5">
            <p className="text-[11px]">
              <span className="text-[var(--accent)]">❯</span> what do we know about token rotation?
            </p>
          </div>

          <div className="rounded-md border border-[var(--border)] bg-[var(--bg-raised)] px-2 py-1.5">
            <p className="text-[10px] text-[var(--text-muted)]">+ Thought · 0.4s</p>
          </div>

          <div className="rounded-md border border-[var(--border)] bg-[var(--bg-raised)] px-2 py-1.5 font-mono text-[11px]">
            <p className="text-[var(--accent)]">✓ memory_digest</p>
            <p className="text-[var(--text-muted)]">{'>'} repo: mimir</p>
            <p className="text-[var(--text-muted)]">12 memories · auth, deploys, conventions</p>
          </div>

          <div className="rounded-md border border-[var(--border)] bg-[var(--bg-raised)] px-2 py-1.5 font-mono text-[11px]">
            <p className="text-[var(--accent)]">✓ memory_search</p>
            <p className="text-[var(--text-muted)]">{'>'} query: &quot;token rotation&quot;</p>
            <p className="text-[var(--text-muted)]">auth/token-rotation · auth/session-expiry</p>
          </div>

          <div className="rounded-md border border-[var(--border)] px-2 py-1.5 leading-relaxed">
            <p>
              Tokens rotate from <span className="text-[var(--fg)]">Settings → API keys</span>. The old key keeps
              working for 24 hours, so deploy first and revoke after.
            </p>
            <p className="mt-1 text-[10px] text-[var(--text-muted)]">read 2 memories · 1.1s</p>
          </div>

          <div className="flex items-center gap-1.5 px-1 text-[10px] text-[var(--text-muted)]">
            <span className="text-[var(--text-muted)]">{'>'}</span>
            <span className="inline-block h-3 w-1.5 bg-[var(--fg)]" aria-hidden="true" />
          </div>
        </div>

        <aside className="hidden w-44 shrink-0 flex-col gap-3 border-l border-[var(--border)] p-3 lg:flex">
          <p className="text-[10px] text-[var(--text-muted)]">Context</p>
          <div className="space-y-0.5 text-[10px] text-[var(--text-muted)]">
            <p>1.9K tokens</p>
            <p>2% used</p>
            <p>$0.002 spent</p>
          </div>
          <div>
            <p className="mb-1 text-[10px] uppercase tracking-wide text-[var(--text-muted)]">MCP</p>
            <p className="flex items-center justify-between gap-2 text-[10px]">
              <span className="truncate">
                <span className="text-[var(--accent)]">•</span> mimir
              </span>
              <span className="text-[var(--text-muted)]">Connected</span>
            </p>
          </div>
        </aside>
      </div>

      <div className="flex items-center justify-between gap-3 border-t border-[var(--border)] px-3 py-1.5 font-mono text-[10px] text-[var(--text-muted)]">
        <span>~/Development/mimir:main</span>
        <span>1.9K (2%) · $0.002 ctrl+p commands</span>
      </div>
    </figure>
  )
}
