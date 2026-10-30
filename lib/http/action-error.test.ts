import { describe, expect, it } from 'vitest'

import { flagError } from './action-error'
import type { Translate } from '@/lib/i18n/request'

const t: Translate = (key) => key

describe('flagError', () => {
  it('translates a code the service raised on purpose', () => {
    expect(flagError(Object.assign(new Error('nope'), { code: 'forbidden' }), t, 'fallback')).toBe(
      'app.error.forbidden',
    )
  })

  it('falls back rather than showing a driver message', () => {
    expect(flagError(new Error('relation "memories" does not exist'), t, 'fallback')).toBe('fallback')
  })
})
