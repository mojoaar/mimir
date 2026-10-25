'use client'

import Link from 'next/link'

/**
 * A native disclosure, so the menu works with a keyboard and without
 * JavaScript. The sign-out form is passed in: the action lives on the server.
 */
export function UserMenu({
  email,
  profile,
  signOutLabel,
  signOut,
}: {
  email: string
  profile: string
  signOutLabel: string
  signOut: (formData: FormData) => Promise<void>
}) {
  return (
    <details className="relative">
      <summary className="flex cursor-pointer list-none items-center gap-1 text-[var(--text-muted)] hover:text-[var(--fg)]">
        <span className="max-w-[12rem] truncate">{email}</span>
        <span aria-hidden="true">▾</span>
      </summary>
      <div className="absolute right-0 z-20 mt-2 flex w-44 flex-col gap-2 rounded border border-[var(--border)] bg-[var(--bg-raised)] p-3 text-sm shadow-lg">
        <Link href="/app/settings/profile" className="underline hover:text-[var(--fg)]">
          {profile}
        </Link>
        <form action={signOut}>
          <button type="submit" className="underline hover:text-[var(--fg)]">
            {signOutLabel}
          </button>
        </form>
      </div>
    </details>
  )
}
