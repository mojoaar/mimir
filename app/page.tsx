import Link from 'next/link'

export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-2xl flex-col justify-center gap-6 px-6">
      <h1 className="text-3xl font-semibold tracking-tight">Mimir</h1>
      <p className="text-neutral-600">
        Long-term memory for your coding agents. Self-hosted, inspectable, and shared across
        every agent that speaks MCP.
      </p>
      <div className="flex gap-4 text-sm">
        <Link href="/login" className="rounded-md bg-neutral-900 px-4 py-2 font-medium text-white">
          Sign in
        </Link>
      </div>
    </main>
  )
}
