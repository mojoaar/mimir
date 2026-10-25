import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/auth/context', () => ({
  requireUser: async () => ({
    id: 'user-1',
    email: 'alice@example.test',
    name: 'Alice',
    role: 'user',
    status: 'active',
    mfaEnabled: false,
  }),
}))

vi.mock('@/lib/auth/mfa', () => ({
  mfaEnabled: async () => state.enabled,
  pendingEnrollment: async () => ({ secret: 'JBSWY3DPEHPK3PXP', uri: 'otpauth://totp/x' }),
  beginEnrollment: async () => ({ secret: 'JBSWY3DPEHPK3PXP', uri: 'otpauth://totp/x' }),
}))

vi.mock('@/lib/settings/security', () => ({ getRequireMfa: async () => false }))

vi.mock('qrcode', () => ({ default: { toString: async () => '<svg data-test="qr"></svg>' } }))

// The real component is async (it generates the QR); a server-render test
// cannot await a nested async component, so its behaviour is covered by the
// enrolment branch below the page.
vi.mock('./enrolment', () => ({
  Enrolment: () => <div data-test="enrolment">Scan this with your authenticator app</div>,
}))

const state = { enabled: false }

const { default: MfaPage } = await import('./page')

async function render(params: { notice?: string; error?: string } = {}) {
  return renderToStaticMarkup(
    await MfaPage({ searchParams: Promise.resolve(params) }) as React.ReactElement,
  )
}

describe('the two-factor page', () => {
  it('offers the QR while it is off', async () => {
    state.enabled = false
    const html = await render()

    expect(html).toContain('data-test="enrolment"')
    expect(html).not.toContain('Turn off')
  })

  it('offers to turn it off when it is on', async () => {
    state.enabled = true
    const html = await render()

    expect(html).toContain('Turn off')
    expect(html).not.toContain('Scan this')
  })

  it('explains why turning it off is refused when the install requires it', async () => {
    state.enabled = true
    const html = await render({ error: 'required' })

    expect(html).toContain('requires two-factor authentication')
  })
})
