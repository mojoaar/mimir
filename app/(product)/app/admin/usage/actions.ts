'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { audit } from '@/lib/audit'
import { requireAdmin } from '@/lib/auth/admin'
import { pruneUsage } from '@/lib/usage/service'

const PATH = '/app/admin/usage'

/** A manual prune, so an admin can reclaim the space without waiting for a job. */
export async function pruneUsageAction(formData: FormData): Promise<void> {
  const admin = await requireAdmin()
  const raw = Math.trunc(Number(formData.get('days') ?? 90))
  const days = Number.isFinite(raw) ? Math.min(Math.max(raw, 1), 3650) : 90

  const removed = await pruneUsage(days)
  await audit({
    actorType: 'user',
    actorId: admin.id,
    action: 'admin.usage.prune',
    detail: { days, removed },
  })

  revalidatePath(PATH)
  redirect(`${PATH}?pruned=${removed}&days=${days}`)
}
