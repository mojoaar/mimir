import { redirect } from 'next/navigation'

/** The two-factor section moved onto the profile page; keep old links working. */
export default async function MfaPage({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string; error?: string }>
}) {
  const { notice, error } = await searchParams
  const query = new URLSearchParams()
  if (notice) query.set('notice', notice)
  if (error) query.set('error', error)
  const suffix = query.size > 0 ? `?${query.toString()}` : ''

  redirect(`/app/settings/profile${suffix}`)
}
