import Link from 'next/link'

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-2xl flex-col justify-center gap-4 px-4 py-16 sm:px-6">
      <p className="text-sm text-[var(--text-muted)]">404</p>
      <h1 className="text-2xl font-semibold tracking-tight">There is nothing here.</h1>
      <p className="text-sm text-[var(--text-muted)]">
        The page you asked for does not exist. Mimir keeps memories, not URLs.
      </p>
      <div className="flex gap-4 text-sm">
        <Link href="/" className="text-[var(--accent)] underline">
          Home
        </Link>
        <Link href="/docs" className="text-[var(--accent)] underline">
          Documentation
        </Link>
      </div>
    </main>
  )
}
