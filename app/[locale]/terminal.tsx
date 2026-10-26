/**
 * A transcript, not a screenshot: the landing has to show what Mimir does for
 * an agent, and a terminal is the place an agent lives. English is intentional
 * — it is a code sample, like the docker command, not interface copy.
 */
export function MimirTerminal() {
  const dot = (color: string) => (
    <span className="h-2.5 w-2.5 rounded-full" style={{ background: color }} aria-hidden="true" />
  )

  return (
    <figure
      aria-label="An OpenCode session: the agent asks Mimir what the project already knows, then searches it before answering."
      className="overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--bg-sunken)] shadow-sm"
    >
      <div className="flex items-center gap-2 border-b border-[var(--border)] px-3 py-2">
        <span className="flex gap-1.5">
          {dot('#ff5f57')}
          {dot('#febc2e')}
          {dot('#28c840')}
        </span>
        <span className="mx-auto font-mono text-xs text-[var(--text-muted)]">
          opencode — ~/dev/mimir
        </span>
        <span className="w-12" aria-hidden="true" />
      </div>

      <div className="overflow-x-auto px-4 py-4 font-mono text-xs leading-relaxed sm:text-[13px]">
        <div className="min-w-[34rem] whitespace-pre">
          <div>
            <span className="text-[var(--accent)]">❯</span> opencode
          </div>
          <div className="text-[var(--text-muted)]">
            {'  '}repo: mimir · mcp: mimir <span className="text-[var(--accent)]">connected</span>
          </div>
          <div> </div>
          <div>
            <span className="text-[var(--accent)]">❯</span> what do we know about token rotation?
          </div>
          <div> </div>
          <div className="text-[var(--accent)]">{'  ✻'} memory_digest</div>
          <div className="text-[var(--text-muted)]">
            {'  ✓'} 12 memories · auth, deploys, conventions
          </div>
          <div> </div>
          <div className="text-[var(--accent)]">
            {'  ✻'} memory_search <span className="text-[var(--text-muted)]">&quot;token rotation&quot;</span>
          </div>
          <div className="text-[var(--text-muted)]">{'  ✓'} auth/token-rotation</div>
          <div> </div>
          <div>Tokens rotate from Settings → API keys. The old key keeps working</div>
          <div>for 24 hours, so deploy first and revoke after.</div>
          <div> </div>
          <div>
            <span className="text-[var(--accent)]">❯</span>{' '}
            <span className="bg-[var(--fg)] text-[var(--bg)]" aria-hidden="true">
              {' '}
            </span>
          </div>
        </div>
      </div>
    </figure>
  )
}
