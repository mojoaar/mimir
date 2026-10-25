import { expect, test } from 'vitest'
import { EMBEDDING_DIM } from './embedding'

test('the install dimension is 768', () => {
  expect(EMBEDDING_DIM).toBe(768)
})
