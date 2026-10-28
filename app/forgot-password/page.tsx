import type { Metadata } from 'next'
import Link from 'next/link'

import { PRIVATE_ROBOTS } from '@/lib/seo'

import { translator } from '@/lib/i18n/request'

import { ResetForm } from './form'

export const instant = false

export const metadata: Metadata = { title: 'Forgot password - Mimir', robots: PRIVATE_ROBOTS }

export default async function ForgotPasswordPage() {
  const t = await translator()

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-sm flex-col justify-center gap-6 px-4 py-12 sm:px-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold">{t('app.forgot.title')}</h1>
        <p className="text-sm text-[var(--text-muted)]">{t('app.forgot.body')}</p>
      </div>

      <ResetForm
        labels={{
          email: t('app.forgot.email'),
          submit: t('app.forgot.submit'),
          pending: t('app.forgot.pending'),
        }}
      />

      <p className="text-sm text-[var(--text-muted)]">
        <Link href="/login" className="text-[var(--accent)] underline">
          {t('app.forgot.back')}
        </Link>
      </p>
    </main>
  )
}
