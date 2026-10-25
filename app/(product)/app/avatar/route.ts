import { requireUser } from '@/lib/auth/context'
import { getAvatar, initialAvatar } from '@/lib/users/avatar'

export const instant = false

/** One small picture per account, read straight from its row. */
export async function GET(): Promise<Response> {
  const user = await requireUser()
  const avatar = await getAvatar(user.id)

  const body = avatar?.bytes ?? initialAvatar(user.email)
  const type = avatar?.type ?? 'image/svg+xml'

  return new Response(new Uint8Array(body), {
    headers: {
      'content-type': type,
      // No shared caches: this is one person's picture, and a fresh upload must
      // show on the next page load.
      'cache-control': 'private, no-store',
    },
  })
}
