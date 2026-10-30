import { redirect } from 'next/navigation';

import type { Metadata } from 'next';

export const instant = false;

export const metadata: Metadata = {
  title: 'Set a password',
  robots: { index: false, follow: false },
};

/**
 * Links minted before the token moved to the fragment still arrive here. They
 * were already in the request line, so sending the browser on loses nothing;
 * everything minted now starts at /set-password with the hash.
 */
export default async function LegacySetPasswordPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  redirect(`/set-password#${encodeURIComponent(token)}`);
}
