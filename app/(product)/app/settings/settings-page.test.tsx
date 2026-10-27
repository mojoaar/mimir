import { describe, expect, it } from 'vitest'

import SettingsPage from './page'

describe('the old settings page', () => {
  it('sends you to the profile page rather than showing a second settings screen', async () => {
    await expect(SettingsPage()).rejects.toMatchObject({
      digest: expect.stringContaining('/app/settings/profile'),
    })
  })
})
