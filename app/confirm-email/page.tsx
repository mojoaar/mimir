import type { Metadata } from 'next';

import { translator } from '@/lib/i18n/request';

import { ConfirmEmailForm } from './form';

export const instant = false;

export const metadata: Metadata = {
  title: 'Confirm your address',
  robots: { index: false, follow: false },
};

export default async function ConfirmEmailPage() {
  const t = await translator();

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-6 px-4 py-12 sm:px-6">
      <div>
        <h1 className="text-2xl font-semibold">{t('app.emailConfirm.title')}</h1>
        <p className="mt-2 text-sm text-[var(--text-muted)]">{t('app.emailConfirm.body')}</p>
      </div>
      <ConfirmEmailForm
        labels={{
          submit: t('app.emailConfirm.button'),
          invalid: t('app.emailConfirm.invalid'),
        }}
      />
    </main>
  );
}
