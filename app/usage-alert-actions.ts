'use server'

import { revalidatePath } from 'next/cache'
import { requireAdmin } from '@/lib/auth/admin'
import { dismiss } from '@/lib/usage/service'

/**
 * The pill exists to be got rid of. One row per admin, so dismissing it does
 * not silence the other admin, and a later spike is newer than the dismissal.
 */
export async function dismissUsageSpikeAction(): Promise<void> {
  const admin = await requireAdmin()
  await dismiss(admin.id)
  revalidatePath('/', 'layout')
}
