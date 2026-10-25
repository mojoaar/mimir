import { isCidr } from '../http/cidr'
import { InvalidSetting, readSetting, writeSetting } from './store'

export async function getRequireMfa(): Promise<boolean> {
  return (await readSetting<boolean>('require_mfa')) ?? false
}

export async function setRequireMfa(value: boolean, updatedBy: string): Promise<void> {
  await writeSetting('require_mfa', value, updatedBy)
}

export async function getIpAllowlist(): Promise<string[]> {
  const stored = await readSetting<string[]>('ip_allowlist')
  if (!Array.isArray(stored)) return []
  // A hand-edited settings row must not take the whole install offline.
  return stored.filter((entry) => typeof entry === 'string' && isCidr(entry))
}

export async function setIpAllowlist(list: string[], updatedBy: string): Promise<void> {
  const clean = list.map((entry) => entry.trim()).filter((entry) => entry !== '')
  const bad = clean.find((entry) => !isCidr(entry))
  if (bad !== undefined) {
    throw new InvalidSetting(`"${bad}" is not a CIDR block; write it as 203.0.113.0/24`)
  }
  await writeSetting('ip_allowlist', clean, updatedBy)
}
