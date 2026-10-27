import { describe, expect, it } from 'vitest'
import { resolveConfig } from '../src/config.js'

const env = { MIMIR_URL: 'https://mimir.example', MIMIR_TOKEN: 'from-env' }

describe('resolving the plugin config', () => {
  it('prefers options over the environment', () => {
    expect(resolveConfig({ url: 'https://opt.example', token: 'from-opt' }, env)).toEqual({
      url: 'https://opt.example',
      token: 'from-opt',
      tools: 'auto',
    })
  })

  it('falls back to the environment', () => {
    expect(resolveConfig({}, env)?.token).toBe('from-env')
  })

  it('reads the token file when no token is configured anywhere else', () => {
    const config = resolveConfig({ url: 'https://mimir.example', tokenFile: '/tmp/t' }, {}, () => 'from-file\n')
    expect(config?.token).toBe('from-file')
  })

  it('returns null when the token file is missing or empty', () => {
    const missing = () => {
      throw new Error('ENOENT')
    }
    expect(resolveConfig({ url: 'https://mimir.example', tokenFile: '/tmp/t' }, {}, missing)).toBeNull()
    expect(resolveConfig({ url: 'https://mimir.example', tokenFile: '/tmp/t' }, {}, () => '  ')).toBeNull()
  })

  it('returns null without a url', () => {
    expect(resolveConfig({ token: 'x' }, {})).toBeNull()
  })

  it('normalises a trailing slash and a url that already ends in /mcp', () => {
    expect(resolveConfig({ url: 'https://mimir.example///', token: 'x' }, {})?.url).toBe('https://mimir.example')
    expect(resolveConfig({ url: 'https://mimir.example/mcp', token: 'x' }, {})?.url).toBe('https://mimir.example')
  })

  it('keeps only the three known tool policies', () => {
    expect(resolveConfig({ url: 'u', token: 't', tools: 'always' }, {})?.tools).toBe('always')
    expect(resolveConfig({ url: 'u', token: 't', tools: 'sometimes' }, {})?.tools).toBe('auto')
  })
})
