import type { Metadata } from 'next';

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

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-6 px-4 py-12 sm:px-6">
      <div>
        <h1 className="text-2xl font-semibold">Set a password</h1>
        <p className="mt-2 text-sm text-[var(--text-muted)]">
          Pick something at least 12 characters long. This link works once.
        </p>
      </div>
      <PasswordForm token={token} />
    </main>
  );
}
