export const THEME_COOKIE = 'mimir_theme'

export const THEMES = ['nordlys', 'fjord', 'ravn', 'skumring'] as const

export type ThemeName = (typeof THEMES)[number]
export type ThemeMode = 'dark' | 'light'
export type ThemeValue = `${ThemeName}-${ThemeMode}`

export const DEFAULT_THEME: ThemeValue = 'nordlys-dark'

export const THEME_LABELS: Record<ThemeValue, string> = {
  'nordlys-dark': 'Nordlys',
  'nordlys-light': 'Nordlys light',
  'fjord-dark': 'Fjord',
  'fjord-light': 'Fjord light',
  'ravn-dark': 'Ravn',
  'ravn-light': 'Ravn light',
  'skumring-dark': 'Skumring',
  'skumring-light': 'Skumring light',
}

// Each value is that theme's --background-base, so the browser chrome matches
// the page before the first paint settles.
const THEME_COLORS: Record<ThemeValue, string> = {
  'nordlys-dark': '#0b1020',
  'nordlys-light': '#dae5e1',
  'fjord-dark': '#0e1620',
  'fjord-light': '#dbe3ea',
  'ravn-dark': '#0a0b12',
  'ravn-light': '#e2e1e9',
  'skumring-dark': '#111218',
  'skumring-light': '#e0e2e6',
}

const VALID = new Set<string>(Object.keys(THEME_LABELS))

/**
 * A cookie is untrusted text: look it up in a set rather than indexing an
 * object, so a value like "toString" cannot resolve to a prototype member.
 */
export function parseTheme(raw: string | undefined | null): ThemeValue {
  const value = (raw ?? '').trim().toLowerCase()
  if (value === '') return DEFAULT_THEME
  if (VALID.has(value)) return value as ThemeValue
  if ((THEMES as readonly string[]).includes(value)) return `${value}-dark` as ThemeValue
  return DEFAULT_THEME
}

export function themeColor(value: ThemeValue): string {
  return THEME_COLORS[value]
}
