import { openValue, sealValue } from './secrets'
import { InvalidSetting, readSetting, writeSetting } from './store'

export type EmailSettings = {
  enabled: boolean
  from: string
  apiKey: string
}

/** Returns null when email is unconfigured or switched off, so callers have one thing to check. */
export async function getEmailSettings(): Promise<EmailSettings | null> {
  const stored = await readSetting<unknown>('email_settings')
  const value = openValue<EmailSettings>(stored)
  return value?.enabled && value.apiKey && value.from ? value : null
}

export async function setEmailSettings(
  value: EmailSettings | null,
  updatedBy: string,
): Promise<void> {
  if (value === null) {
    await writeSetting('email_settings', null, updatedBy)
    return
  }
  if (!value.from.includes('@')) {
    throw new InvalidSetting('the from address must be an email address')
  }
  await writeSetting('email_settings', sealValue(value), updatedBy)
}
