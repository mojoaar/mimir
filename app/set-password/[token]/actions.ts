'use server';

import { redirect } from 'next/navigation';

import { setPasswordWithToken } from '@/lib/auth/tokens';

export type PasswordState = { error?: string };

export async function setPasswordAction(
  _prev: PasswordState,
  formData: FormData,
): Promise<PasswordState> {
  const token = String(formData.get('token') ?? '');
  const password = String(formData.get('password') ?? '');

  const result = await setPasswordWithToken(token, password);

  if (!result.ok) {
    return {
      error:
        result.reason === 'weak'
          ? 'Use at least 12 characters.'
          : 'This link is no longer valid. Ask an administrator for a new one.',
    };
  }

  redirect('/login?set=1');
}
