import { describe, expect, it } from 'vitest'
import { actionMessage } from './errors'
import { t } from './index'

const da = (key: string, vars?: Record<string, string | number>) => t('da', key, vars)

describe('action messages', () => {
  it('names the reason a person can act on, in their language', () => {
    const error = Object.assign(new Error('your current password is wrong'), {
      code: 'invalid_params',
    })

    expect(actionMessage(error, da)).toBe('Din nuværende adgangskode er forkert.')
  })

  it('says which folder rule was broken, not that the input was odd', () => {
    const taken = Object.assign(new Error('that folder is already claimed by another project'), {
      code: 'invalid_params',
    })
    const relative = Object.assign(
      new Error('a folder must be an absolute path, for example /Users/you/AI'),
      { code: 'invalid_params' },
    )

    expect(actionMessage(taken, da)).toBe(t('da', 'app.projectSettings.folderTaken'))
    expect(actionMessage(relative, da)).toBe(t('da', 'app.projectSettings.folderAbsolute'))
  })

  it('falls back to the code when the sentence is not one we translate', () => {
    const error = Object.assign(new Error('insert violates constraint'), { code: 'forbidden' })

    expect(actionMessage(error, da)).toBe(t('da', 'app.error.forbidden'))
  })

  it('never shows a driver message for a code it does not know', () => {
    const error = Object.assign(new Error('duplicate key value violates unique constraint'), {
      code: '23505',
    })

    expect(actionMessage(error, da)).toBe(t('da', 'app.error.generic'))
  })

  it('lets a redirect through instead of swallowing it', () => {
    const redirect = Object.assign(new Error('NEXT_REDIRECT'), {
      digest: 'NEXT_REDIRECT;replace;/app;307;',
    })

    expect(() => actionMessage(redirect, da)).toThrow('NEXT_REDIRECT')
  })
})
