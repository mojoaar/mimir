import { describe, expect, it } from 'vitest'

import { normaliseRepoKey } from './repo'

describe('normaliseRepoKey', () => {
  it.each([
    ['git@github.com:mojoaar/mimir.git', 'github.com/mojoaar/mimir'],
    ['https://github.com/mojoaar/Mimir.git', 'github.com/mojoaar/mimir'],
    ['https://user:token@github.com/mojoaar/mimir', 'github.com/mojoaar/mimir'],
    ['ssh://git@gitlab.example.com:2222/team/repo.git', 'gitlab.example.com/team/repo'],
    ['https://gitlab.example.com/team/repo/', 'gitlab.example.com/team/repo'],
  ])('normalises %s', (input, expected) => {
    expect(normaliseRepoKey(input)).toBe(expected)
  })

  it('hashes a local path so the same checkout matches across sessions', () => {
    expect(normaliseRepoKey('/Users/mojoaar/Development/mimir')).toBe(
      normaliseRepoKey('/Users/mojoaar/Development/mimir/'),
    )
  })

  it('returns null for junk', () => {
    expect(normaliseRepoKey('not a repo')).toBeNull()
  })
})
