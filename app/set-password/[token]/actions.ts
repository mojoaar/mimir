'use server';

import { redirect } from 'next/navigation';

import { setPasswordWithToken } from '@/lib/auth/tokens';
import { translator } from '@/lib/i18n/request';

export type PasswordState = { error?: string };

export async function setPasswordAction(
  _prev: PasswordState,
  formData: FormData,
): Promise<PasswordState> {
  const token = String(formData.get('token') ?? '');
  const password = String(formData.get('password') ?? '');

  const result = await setPasswordWithToken(token, password);

  if (!result.ok) {
    const t = await translator();
    return {
      error:
        result.reason === 'weak' ? t('app.setPassword.weak') : t('app.setPassword.invalid'),
    };
  }

  redirect('/login?set=1');
}
