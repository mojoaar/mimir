import { describe, expect, it } from 'vitest'
import { checkProviderUrl } from './url'

describe('checkProviderUrl', () => {
  it.each([
    ['http://127.0.0.1:5432', 'loopback ipv4'],
    ['http://127.1.2.3/v1', 'loopback range'],
    ['http://localhost:11434', 'localhost'],
    ['http://api.localhost', 'localhost suffix'],
    ['http://169.254.169.254/latest/meta-data', 'link local'],
    ['http://10.1.2.3', 'private 10/8'],
    ['http://172.16.0.1', 'private 172.16/12'],
    ['http://192.168.1.5:8080/v1', 'private 192.168/16'],
    ['http://0.0.0.0:3000', 'unspecified'],
    ['http://[::1]:11434', 'loopback ipv6'],
    ['http://[fe80::1]:80', 'link local ipv6'],
    ['http://[fd00::1]:80', 'unique local ipv6'],
    ['file:///etc/passwd', 'not http'],
    ['ftp://example.com', 'not http'],
    ['not a url', 'not a url'],
  ])('refuses %s (%s)', (url) => {
    const result = checkProviderUrl(url)

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason.length).toBeGreaterThan(10)
  })

  it.each([
    ['http://host.docker.internal:11434'],
    ['http://ollama:11434'],
    ['https://api.deepseek.com'],
    ['https://opencode.ai/inference/go/openai'],
    ['https://example.com/v1'],
  ])('accepts %s', (url) => {
    expect(checkProviderUrl(url)).toEqual({ ok: true })
  })

  it('names the address it refused', () => {
    const result = checkProviderUrl('http://192.168.1.5:8080/v1')

    expect(result).toEqual({ ok: false, reason: expect.stringContaining('192.168.1.5') })
  })

  it('refuses the documented local hosts when private addresses are not allowed', () => {
    expect(checkProviderUrl('http://ollama:11434', { allowPrivate: false }).ok).toBe(false)
  })
})
