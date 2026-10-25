import Link from 'next/link'

// Shown when a page calls notFound() — a missing project, a purged memory, an
// agent that does not exist. Unknown URLs never reach this file; proxy.ts sends
// them to app/api/not-found/route.ts, which can set a real 404 status.
export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-2xl flex-col justify-center gap-4 px-4 py-16 sm:px-6">
      <p className="font-mono text-xs tracking-[0.08em] text-[var(--text-muted)]">
        404 · NO COMPLETION
      </p>
      <h1 className="text-2xl font-semibold tracking-tight">Mimir looked. Nothing came back.</h1>
      <p className="font-mono text-sm text-[var(--text-muted)]">
        Retrieved 0 documents. Reranked them anyway.
      </p>
      <p className="text-sm text-[var(--text-muted)]">
        Whatever this was, it is not here now — deleted, archived, or never written down. Mimir
        keeps memories, and memories can be forgotten.
      </p>
      <div className="flex flex-wrap gap-4 text-sm">
        <Link href="/" className="text-[var(--accent)] underline">
          Home
        </Link>
        <Link href="/app" className="text-[var(--accent)] underline">
          Your projects
        </Link>
        <Link href="/docs" className="text-[var(--accent)] underline">
          Documentation
        </Link>
      </div>
    </main>
  )
}
