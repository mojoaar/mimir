import type { Metadata } from 'next'
import Link from 'next/link'

import { PRIVATE_ROBOTS } from '@/lib/seo'

import { ResetForm } from './form'

export const instant = false

export const metadata: Metadata = { title: 'Forgot password — Mimir', robots: PRIVATE_ROBOTS }

export default async function ForgotPasswordPage() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-sm flex-col justify-center gap-6 px-4 py-12 sm:px-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold">Forgot your password?</h1>
        <p className="text-sm text-[var(--text-muted)]">
          Give the address you sign in with. If it has an account, a link arrives that lets you
          choose a new password. The link lasts one hour and works once.
        </p>
      </div>

      <ResetForm />

      <p className="text-sm text-[var(--text-muted)]">
        <Link href="/login" className="text-[var(--accent)] underline">
          Back to sign in
        </Link>
      </p>
    </main>
  )
}
