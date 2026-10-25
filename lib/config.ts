import { isIP } from 'node:net'

export class ConfigError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ConfigError'
  }
}

export type Config = {
  nodeEnv: 'development' | 'production' | 'test'
  secret: string
  publicUrlSeed: string | null
  adminEmail: string | null
  adminPassword: string | null
  trustedProxies: string[]
  databaseUrl: string
  databaseAdminUrl: string
}

const SECRET_HELP = `MIMIR_SECRET is required and must be 64 hex characters.
Generate one with: openssl rand -hex 32
Store it outside compose: losing it makes provider keys and backups unreadable.`

function required(env: NodeJS.ProcessEnv, name: string): string {
  const value = env[name]
  if (!value) throw new ConfigError(`${name} is required.`)
  return value
}

function parseTrustedProxies(raw: string | undefined): string[] {
  if (!raw) return []
  return raw
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry !== '')
    .map((entry) => {
      if (isIP(entry)) return entry
      const slash = entry.lastIndexOf('/')
      const host = slash > 0 ? entry.slice(0, slash) : ''
      const prefixText = slash > 0 ? entry.slice(slash + 1) : ''
      const family = isIP(host)
      const max = family === 4 ? 32 : family === 6 ? 128 : -1
      const prefix = Number(prefixText)
      if (max > 0 && /^\d{1,3}$/.test(prefixText) && prefix <= max) return entry
      throw new ConfigError(
        `MIMIR_TRUSTED_PROXIES contains "${entry}", which is not an IP address or CIDR block.`
      )
    })
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const secret = env.MIMIR_SECRET
  if (!secret || !/^[0-9a-f]{64}$/i.test(secret)) {
    throw new ConfigError(SECRET_HELP)
  }

  const nodeEnv =
    env.NODE_ENV === 'production' || env.NODE_ENV === 'test'
      ? env.NODE_ENV
      : 'development'

  return {
    nodeEnv,
    secret,
    publicUrlSeed: env.MIMIR_PUBLIC_URL?.replace(/\/+$/, '') ?? null,
    adminEmail: env.MIMIR_ADMIN_EMAIL || null,
    adminPassword: env.MIMIR_ADMIN_PASSWORD || null,
    trustedProxies: parseTrustedProxies(env.MIMIR_TRUSTED_PROXIES),
    databaseUrl: required(env, 'DATABASE_URL'),
    databaseAdminUrl: required(env, 'DATABASE_ADMIN_URL'),
  }
}

let cached: Config | null = null

export function getConfig(): Config {
  if (!cached) cached = loadConfig(process.env)
  return cached
}
