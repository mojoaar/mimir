import { redirect } from 'next/navigation'

/** Everything that used to live here now lives on the profile page. */
export default async function SettingsPage() {
  redirect('/app/settings/profile')
}
