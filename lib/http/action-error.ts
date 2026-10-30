import { actionMessage } from '@/lib/i18n/errors'
import type { Translate } from '@/lib/i18n/request'

/**
 * The one place an action decides what a person sees when the service refuses.
 * A known code is translated; anything else is a bug and gets the caller's own
 * sentence instead of a driver message.
 */
export function flagError(error: unknown, t: Translate, fallback: string): string {
  console.error('action failed:', error instanceof Error ? error.message : String(error))
  const mapped = actionMessage(error, t)
  return mapped === t('app.error.generic') ? fallback : mapped
}
