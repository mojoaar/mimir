import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { MESSAGES } from './index'
import { en } from './messages/en'

const locales = ['en', 'da', 'de'] as const

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return sourceFiles(path)
    return /\.(ts|tsx)$/.test(name) && !name.includes('.test.') ? [path] : []
  })
}

function placeholders(value: string): string[] {
  return [...value.matchAll(/\{(\w+)\}/g)].map((match) => match[1] ?? '').sort()
}

describe('the message catalogs', () => {
  it('carry the same keys in every language', () => {
    const english = Object.keys(en).sort()

    for (const locale of locales) {
      expect(Object.keys(MESSAGES[locale]).sort(), locale).toEqual(english)
    }
  })

  it('has no empty or unfinished line', () => {
    for (const locale of locales) {
      for (const [key, value] of Object.entries(MESSAGES[locale])) {
        expect(value.trim(), `${locale} ${key}`).not.toBe('')
        expect(value, `${locale} ${key}`).not.toContain('TODO')
      }
    }
  })

  // House style: a plain hyphen, never an em dash, in anything a person reads.
  it('never uses an em dash', () => {
    for (const locale of locales) {
      for (const [key, value] of Object.entries(MESSAGES[locale])) {
        expect(value.includes('\u2014'), `${locale} ${key}`).toBe(false)
      }
    }
  })

  it('keeps every placeholder in the translation', () => {
    for (const [key, value] of Object.entries(en)) {
      for (const locale of ['da', 'de'] as const) {
        expect(
          placeholders((MESSAGES[locale] as Record<string, string>)[key] ?? ''),
          `${locale} ${key}`,
        ).toEqual(
          placeholders(value),
        )
      }
    }
  })

  it('only ever asks for a key that exists', () => {
    const used = new Set<string>()

    for (const file of sourceFiles('app')) {
      const source = readFileSync(file, 'utf8')
      for (const match of source.matchAll(/\bt\(\s*'([^']+)'/g)) {
        const key = match[1] ?? ''
        if (key.startsWith('app.')) used.add(key)
      }
      // A ternary inside t( picks one of two literal keys, and the regex above
      // only sees the first one.
      for (const match of source.matchAll(/t\(\s*[^)]*\?\s*'([^']+)'\s*:\s*'([^']+)'/g)) {
        for (const key of [match[1] ?? '', match[2] ?? '']) {
          if (key.startsWith('app.')) used.add(key)
        }
      }
    }

    expect(used.size).toBeGreaterThan(100)
    const missing = [...used].filter((key) => !(key in en))
    expect(missing).toEqual([])
  })
})
