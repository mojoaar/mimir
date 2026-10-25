export type AuthUser = {
  id: string
  email: string
  name: string
  role: 'admin' | 'user'
  status: 'pending' | 'active' | 'disabled'
  mfaEnabled: boolean
  /** The language this person chose, or '' before they chose one. */
  locale: string
}
