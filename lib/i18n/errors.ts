import type { Translate } from './request'

/**
 * The service layer speaks English on purpose: the same messages reach MCP and
 * REST clients, where no person is reading them. This maps the handful a person
 * actually sees onto the catalog, so a Danish form never answers in English.
 */
const PHRASES: { test: RegExp; key: string }[] = [
  { test: /current password is wrong/i, key: 'app.error.wrongPassword' },
  { test: /already in use/i, key: 'app.error.emailTaken' },
  { test: /you have not set a password yet/i, key: 'app.error.noPassword' },
  { test: /is not a CIDR block/i, key: 'app.error.badCidr' },
]

const BY_CODE: Record<string, string> = {
  forbidden: 'app.error.forbidden',
  not_found: 'app.error.notFound',
  invalid_params: 'app.error.invalidParams',
  invalid_path: 'app.error.invalidPath',
  body_too_large: 'app.error.bodyTooLarge',
  rate_limited: 'app.error.rateLimited',
  provider_error: 'app.error.provider',
}

export function actionMessage(error: unknown, t: Translate): string {
  const message = error instanceof Error ? error.message : ''
  const digest = (error as { digest?: string }).digest
  if (typeof digest === 'string' && digest.startsWith('NEXT_REDIRECT')) throw error

  for (const phrase of PHRASES) {
    if (phrase.test.test(message)) return t(phrase.key)
  }

  const code = (error as { code?: string }).code
  const key = code ? BY_CODE[code] : undefined
  return key ? t(key) : t('app.error.generic')
}
