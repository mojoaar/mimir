export type AuthUser = {
  id: string
  email: string
  name: string
  role: 'admin' | 'user'
  status: 'pending' | 'active' | 'disabled'
  mfaEnabled: boolean
}
