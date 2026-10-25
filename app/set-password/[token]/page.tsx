import type { Metadata } from 'next';

import { translator } from '@/lib/i18n/request';

import { PasswordForm } from './form';

export const instant = false;

export const metadata: Metadata = {
  title: 'Set a password',
  robots: { index: false, follow: false },
};

export default async function SetPasswordPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const t = await translator();

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-6 px-4 py-12 sm:px-6">
      <div>
        <h1 className="text-2xl font-semibold">{t('app.setPassword.title')}</h1>
        <p className="mt-2 text-sm text-[var(--text-muted)]">{t('app.setPassword.body')}</p>
      </div>
      <PasswordForm
        token={token}
        labels={{
          label: t('app.setPassword.label'),
          submit: t('app.setPassword.submit'),
          pending: t('app.setPassword.pending'),
        }}
      />
    </main>
  );
}
