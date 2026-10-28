import { describe, expect, it } from 'vitest'
import { DEFAULT_THEME, flipTheme, parseTheme, themeColor } from './theme'

describe('parseTheme', () => {
  it('defaults to nordlys dark when the cookie is absent or empty', () => {
    expect(parseTheme(undefined)).toBe('nordlys-dark')
    expect(parseTheme('')).toBe('nordlys-dark')
    expect(parseTheme(null)).toBe('nordlys-dark')
  })

  it('accepts the eight generated values', () => {
    expect(parseTheme('fjord-light')).toBe('fjord-light')
    expect(parseTheme('ravn-dark')).toBe('ravn-dark')
    expect(parseTheme('skumring-light')).toBe('skumring-light')
  })

  it('treats a bare theme name as its dark twin', () => {
    expect(parseTheme('nordlys')).toBe('nordlys-dark')
  })

  it('falls back rather than trusting the cookie', () => {
    expect(parseTheme('<script>')).toBe(DEFAULT_THEME)
    expect(parseTheme('nordlys-blue')).toBe(DEFAULT_THEME)
    expect(parseTheme('toString')).toBe(DEFAULT_THEME)
  })

  it('flips the mode and keeps the family', () => {
    expect(flipTheme('nordlys-dark')).toBe('nordlys-light');
    expect(flipTheme('skumring-light')).toBe('skumring-dark');
  })

  it('has a theme-color for every value', () => {
    for (const t of ['nordlys-dark', 'nordlys-light', 'fjord-dark', 'ravn-light'] as const) {
      expect(themeColor(t)).toMatch(/^#[0-9a-f]{6}$/)
    }
  })
})
