'use server'

import { redirect } from 'next/navigation'

import { requireUser } from '@/lib/auth/context'
import { actionMessage } from '@/lib/i18n/errors'
import { translator } from '@/lib/i18n/request'
import { requestAccess } from '@/lib/projects/requests'

const BACK = '/app/requests'

export async function requestAccessAction(formData: FormData): Promise<void> {
  const user = await requireUser()
  const t = await translator()
  const repo = String(formData.get('repo') ?? '').trim()
  const note = String(formData.get('note') ?? '').trim()

  let answer: 'requested' | 'already'
  try {
    answer = await requestAccess(user.id, repo, note || undefined)
  } catch (error) {
    redirect(`${BACK}?error=${encodeURIComponent(actionMessage(error, t))}`)
  }

  redirect(`${BACK}?notice=${encodeURIComponent(t(`app.requests.${answer}`))}`)
}
