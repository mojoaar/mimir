'use server';

import { translator } from '@/lib/i18n/request';
import { actionMessage } from '@/lib/i18n/errors';
import { confirmEmailChange } from '@/lib/users/email-change';

export type ConfirmState = { ok?: string; error?: string };

export async function confirmEmailAction(
  _prev: ConfirmState,
  formData: FormData,
): Promise<ConfirmState> {
  const t = await translator();
  const token = String(formData.get('token') ?? '');

  try {
    const { email } = await confirmEmailChange(token);
    return { ok: t('app.emailConfirm.done', { email }) };
  } catch (error) {
    return { error: actionMessage(error, t) };
  }
}
