import { readSetting, writeSetting, InvalidSetting } from './store'
import { getConfig } from '../config'

export type SiteSettings = {
  publicUrl: string
  siteName: string
  metaDescription: string
}

const DEFAULT_SITE_NAME = 'Mimir'
const DEFAULT_DESCRIPTION = 'Long-term memory for your agents.'

function normaliseUrl(value: string): string {
  let url: URL
  try {
    url = new URL(value.trim())
  } catch {
    throw new InvalidSetting('the public URL must be an absolute URL, for example https://mimir.example.com')
  }
  if (url.pathname !== '/' || url.search !== '' || url.hash !== '') {
    throw new InvalidSetting('the public URL must be an origin only, with no path, query or fragment')
  }
  return url.origin
}

export async function getPublicUrl(): Promise<string> {
  const stored = await readSetting<string>('public_url')
  if (stored) return stored
  return (getConfig().publicUrlSeed ?? 'http://localhost:3000').replace(/\/+$/, '')
}

export async function getSiteSettings(): Promise<SiteSettings> {
  const [publicUrl, siteName, metaDescription] = await Promise.all([
    getPublicUrl(),
    readSetting<string>('site_name'),
    readSetting<string>('meta_description'),
  ])
  return {
    publicUrl,
    siteName: siteName ?? DEFAULT_SITE_NAME,
    metaDescription: metaDescription ?? DEFAULT_DESCRIPTION,
  }
}

export async function setSiteSettings(
  patch: Partial<SiteSettings>,
  updatedBy: string,
): Promise<void> {
  if (patch.publicUrl !== undefined) {
    await writeSetting('public_url', normaliseUrl(patch.publicUrl), updatedBy)
  }
  if (patch.siteName !== undefined) {
    await writeSetting('site_name', patch.siteName.trim(), updatedBy)
  }
  if (patch.metaDescription !== undefined) {
    await writeSetting('meta_description', patch.metaDescription.trim(), updatedBy)
  }
}
