import Link from 'next/link'

/**
 * Next streams the shell of a dynamic route before `notFound()` resolves, so a
 * status of 404 is not reachable from inside a page here. Rendering the same
 * message without the throw is honest about that: the page says there is
 * nothing, the response says 200, and no crawler is told a lie it can index —
 * product routes also carry `noindex`.
 */
export function Missing({ what }: { what: string }) {
  return (
    <main className="mx-auto max-w-[72ch] px-4 py-12 sm:px-6">
      <h1 className="text-2xl font-semibold">There is nothing here</h1>
      <p className="mt-3 text-[var(--text-muted)]">
        This {what} does not exist, or it belongs to someone else.
      </p>
      <p className="mt-6">
        <Link href="/app" className="text-[var(--accent)] underline focus-visible:outline-2 focus-visible:outline-[var(--accent)]">
          Back to your projects
        </Link>
      </p>
    </main>
  )
}
