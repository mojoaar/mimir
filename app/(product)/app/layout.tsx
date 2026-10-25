import { requireUser } from '@/lib/auth/context'

export const instant = false

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  // The real session check. Middleware only sees that a cookie exists.
  await requireUser()
  return <>{children}</>
}
