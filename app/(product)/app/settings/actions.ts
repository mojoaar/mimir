'use server'

import { revalidatePath } from 'next/cache'
import { requireUser } from '@/lib/auth/context'
import { createApiKey, revokeApiKey } from '@/lib/auth/apikey'
import { audit } from '@/lib/audit'
import { translator } from '@/lib/i18n/request'

export type CreateKeyState = { token?: string; error?: string }

export async function createKeyAction(
  _prev: CreateKeyState,
  formData: FormData,
): Promise<CreateKeyState> {
  const user = await requireUser()
  const name = String(formData.get('name') ?? '').trim()
  if (!name) return { error: (await translator())('app.settings.keyNeedName') }

  const key = await createApiKey(user.id, name)
  await audit({
    actorType: 'user',
    actorId: user.id,
    action: 'auth.apikey_create',
    targetType: 'api_key',
    targetId: key.id,
    // The token itself is never logged, and detail never carries it.
    detail: { name, prefix: key.prefix },
  })
  revalidatePath('/app/settings')

  // Returned to the caller instead of redirected: the token is shown exactly once
  // and never lands in a URL, a log line or browser history.
  // shortcut: a browser refresh re-posts the form and mints a second key; visible
  // in the list and revocable, so it is acceptable until the settings page grows
  // a proper one-shot reveal.
  return { token: key.token }
}

export async function revokeKeyAction(formData: FormData): Promise<void> {
  const user = await requireUser()
  const id = String(formData.get('id') ?? '')
  if (!id) return

  await revokeApiKey(user.id, id)
  await audit({
    actorType: 'user',
    actorId: user.id,
    action: 'auth.apikey_revoke',
    targetType: 'api_key',
    targetId: id,
  })
  revalidatePath('/app/settings')
}
