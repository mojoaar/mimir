import { expect, test } from 'vitest'
import { costMicros, estimateTokens, isSpike } from './cost'

test('a price per million tokens times a token count is micro-dollars', () => {
  expect(costMicros({ prompt: 1000, completion: 200 }, { input: 0.15, output: 0.6 })).toBe(270)
})

test('an embedding call has no output to pay for', () => {
  expect(costMicros({ prompt: 1000, completion: 0 }, { input: 0.04, output: null })).toBe(40)
})

test('a call whose price is unknown costs nothing we can claim', () => {
  expect(costMicros({ prompt: 1000, completion: 0 }, { input: null, output: null })).toBeNull()
  expect(costMicros({ prompt: 1000, completion: 0 }, { input: null, output: 0.6 })).toBeNull()
  // Nothing was used on the unpriced side, so the known side is still usable.
  expect(costMicros({ prompt: 0, completion: 100 }, { input: null, output: 0.6 })).toBe(60)
})

test('a missing count is estimated at four characters a token', () => {
  expect(estimateTokens(1)).toBe(1)
  expect(estimateTokens(4000)).toBe(1000)
})

test('a spike needs both volume and a jump over the quiet median', () => {
  expect(isSpike(19, 1)).toBe(false)
  expect(isSpike(20, 4)).toBe(false)
  expect(isSpike(24, 4)).toBe(true)
  expect(isSpike(20, 5)).toBe(false)
  expect(isSpike(34, 5)).toBe(true)
})
