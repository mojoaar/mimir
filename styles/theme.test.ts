import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const css = readFileSync('styles/theme.css', 'utf8')

const THEMES = ['nordlys', 'fjord', 'ravn', 'skumring'] as const
const ALIASES = [
  '--bg',
  '--fg',
  '--bg-raised',
  '--bg-sunken',
  '--text-muted',
  '--border',
  '--accent',
  '--accent-fg',
  '--danger',
]

describe('theme alias layer', () => {
  it('defines every alias for all eight theme values', () => {
    for (const name of THEMES) {
      for (const mode of ['dark', 'light'] as const) {
        const block = css.split(`[data-theme="${name}-${mode}"]`)[1] ?? ''
        const body = block.slice(0, block.indexOf('}'))
        for (const alias of ALIASES) expect(body, `${name}-${mode} ${alias}`).toContain(`${alias}:`)
      }
    }
  })

  it('never hardcodes a colour, only references a vendored token', () => {
    expect(css).not.toMatch(/#[0-9a-f]{3,8}/i)
  })
})

function tsxFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return tsxFiles(path)
    return entry.name.endsWith('.tsx') ? [path] : []
  })
}

describe('pages', () => {
  it('use theme aliases instead of tailwind palette colours', () => {
    const offenders = tsxFiles('app').filter((file) =>
      /(bg|text|border)-(neutral|red|green|blue|gray|white|black)(-\d{2,3})?\b/.test(
        readFileSync(file, 'utf8'),
      ),
    )
    expect(offenders).toEqual([])
  })
})

describe('globals.css', () => {
  const globals = readFileSync('app/globals.css', 'utf8')

  it('imports tailwind, or none of the utility classes are generated', () => {
    expect(globals).toMatch(/@import 'tailwindcss'/)
  })

  it('keeps its base rules in a layer, so they cannot beat the utilities', () => {
    // An unlayered `* { padding: 0 }` wins against @layer utilities regardless
    // of specificity, which silently cancels every spacing utility on the page.
    expect(globals).not.toMatch(/^\s*\*\s*\{/m)
    expect(globals).toContain('@layer base')
  })
})
