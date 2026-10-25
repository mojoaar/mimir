import { beforeEach, describe, expect, it } from 'vitest'
import { resetFixtures, seedTwoUsersWithProjects, type Fixtures } from '@/lib/db/seed'
import { clearAvatar, getAvatar, initialAvatar, setAvatar } from './avatar'

let f: Fixtures

beforeEach(async () => {
  await resetFixtures()
  f = await seedTwoUsersWithProjects()
})

const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

describe('an avatar', () => {
  it('is stored with its type and read back byte for byte', async () => {
    await setAvatar(f.alice, png, 'image/png')

    const avatar = await getAvatar(f.alice)

    expect(avatar?.type).toBe('image/png')
    expect(avatar?.bytes.equals(png)).toBe(true)
    expect(await getAvatar(f.bob)).toBeNull()
  })

  it('goes away when it is removed', async () => {
    await setAvatar(f.alice, png, 'image/png')
    await clearAvatar(f.alice)

    expect(await getAvatar(f.alice)).toBeNull()
  })

  it('refuses a file over the limit instead of storing part of it', async () => {
    const big = Buffer.alloc(128 * 1024 + 1)

    await expect(setAvatar(f.alice, big, 'image/png')).rejects.toMatchObject({
      code: 'invalid_params',
    })
    expect(await getAvatar(f.alice)).toBeNull()
  })

  it('refuses something that is not an image', async () => {
    await expect(setAvatar(f.alice, png, 'text/plain')).rejects.toMatchObject({
      code: 'invalid_params',
    })
  })

  it('draws the first letter for an account with no picture', () => {
    const svg = initialAvatar('alice@example.test').toString('utf8')

    expect(svg).toContain('<svg')
    expect(svg).toContain('>A<')
    expect(initialAvatar('<script>').toString('utf8')).not.toContain('<script>')
  })
})
