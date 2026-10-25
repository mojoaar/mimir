import { readFileSync } from 'node:fs'
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
