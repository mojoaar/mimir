import { beforeEach, describe, expect, it } from 'vitest'

import { adminPool } from '@/lib/db/pool'
import { resetFixtures, seedTwoUsersWithProjects } from '@/lib/db/seed'
import { withUser } from '@/lib/db/tx'

import { claimFolder, folderForPath, listFolders, releaseFolder } from './folders'
import { localPath } from './repo'
import { archiveProject } from './service'

// Task 2 covers claiming, releasing and looking a folder up. Routing a call
// through resolveProject is Task 3, where the order is decided.

let alice: string
let bob: string
let aliceProjectId: string

async function newProject(owner: string, slug: string): Promise<string> {
  const { rows } = await adminPool().query<{ id: string }>(
    `insert into projects (owner_user_id, name, slug) values ($1, $2, $3) returning id`,
    [owner, slug, slug],
  )
  return rows[0]!.id
}

async function lookup(userId: string, path: string) {
  return withUser(userId, (client) => folderForPath(client, userId, path))
}

beforeEach(async () => {
  await resetFixtures()
  ;({ alice, bob, aliceProjectId } = await seedTwoUsersWithProjects())
})

describe('localPath', () => {
  it('reads an absolute path and refuses a repository key', () => {
    expect(localPath('/Users/alice/AI')).toBe('/Users/alice/AI')
    expect(localPath('/Users/alice/AI/')).toBe('/Users/alice/AI')
    expect(localPath('~')).toBeTruthy()
    expect(localPath('github.com/alice/notes')).toBeNull()
  })
})

describe('a claimed folder', () => {
  it('finds the project from the folder and from below it', async () => {
    await claimFolder(alice, aliceProjectId, '/Users/alice/AI')

    expect((await lookup(alice, '/Users/alice/AI'))?.projectId).toBe(aliceProjectId)
    expect((await lookup(alice, '/Users/alice/AI/work'))?.projectId).toBe(aliceProjectId)
  })

  it('does not match a path that only shares a prefix', async () => {
    await claimFolder(alice, aliceProjectId, '/Users/alice/AI')

    expect(await lookup(alice, '/Users/alice/AI2')).toBeNull()
  })

  it('treats a wildcard character in the path as a character', async () => {
    await claimFolder(alice, aliceProjectId, '/Users/alice/AI_v2')

    // A `_` in the claim used to match the `/` here, sending these writes into
    // the wrong project without an error.
    expect(await lookup(alice, '/Users/alice/AI/v2/work')).toBeNull()
    expect((await lookup(alice, '/Users/alice/AI_v2/work'))?.projectId).toBe(aliceProjectId)
  })

  it('lets the deeper claim win, whatever was claimed first', async () => {
    const work = await newProject(alice, 'alice-work')
    await claimFolder(alice, aliceProjectId, '/Users/alice/AI')
    await claimFolder(alice, work, '/Users/alice/AI/work')

    expect((await lookup(alice, '/Users/alice/AI/work'))?.projectId).toBe(work)
    expect((await lookup(alice, '/Users/alice/AI/work/deep'))?.projectId).toBe(work)
    expect((await lookup(alice, '/Users/alice/AI/other'))?.projectId).toBe(aliceProjectId)
  })

  it('ignores the claim of an archived project', async () => {
    await claimFolder(alice, aliceProjectId, '/Users/alice/AI')
    await archiveProject(alice, aliceProjectId)

    expect(await lookup(alice, '/Users/alice/AI')).toBeNull()
  })

  it('refuses the same folder for a second project of the same account', async () => {
    const other = await newProject(alice, 'alice-other')
    await claimFolder(alice, aliceProjectId, '/Users/alice/AI')

    await expect(claimFolder(alice, other, '/users/alice/ai/')).rejects.toThrow('already claimed')
  })

  it('keeps one row when the same folder is claimed twice', async () => {
    await claimFolder(alice, aliceProjectId, '/Users/alice/AI')
    await claimFolder(alice, aliceProjectId, '/users/alice/ai/')

    expect((await listFolders(alice, aliceProjectId)).map((f) => f.path)).toEqual(['/Users/alice/AI'])
  })

  it('lets bob claim the same path for his own project', async () => {
    const bobs = await newProject(bob, 'bob-notes')
    await claimFolder(alice, aliceProjectId, '/Users/alice/AI')

    await expect(claimFolder(bob, bobs, '/Users/alice/AI')).resolves.toEqual({ path: '/Users/alice/AI' })
    expect((await lookup(bob, '/Users/alice/AI'))?.projectId).toBe(bobs)
    expect(await lookup(alice, '/Users/alice/AI/sub')).toMatchObject({ projectId: aliceProjectId })
  })

  it('does not leak a claim to another account', async () => {
    const bobs = await newProject(bob, 'bob-notes')
    await claimFolder(alice, aliceProjectId, '/Users/alice/AI')

    expect(await lookup(bob, '/Users/alice/AI')).toBeNull()
    expect((await listFolders(bob, bobs)).map((f) => f.path)).toEqual([])
  })

  it('refuses a path that is not absolute and a project the caller does not own', async () => {
    await expect(claimFolder(alice, aliceProjectId, 'AI')).rejects.toThrow('absolute')
    await expect(claimFolder(bob, aliceProjectId, '/Users/alice/AI')).rejects.toThrow('owner')
  })

  it('records the claim and the release in the audit log', async () => {
    const { path } = await claimFolder(alice, aliceProjectId, '/Users/alice/AI')
    const [id] = await folderIds(alice)
    const released = await releaseFolder(alice, id!)

    expect(released.path).toBe(path)
    expect((await listFolders(alice, aliceProjectId)).map((f) => f.path)).toEqual([])

    const { rows } = await adminPool().query<{ action: string; detail: { action?: string } }>(
      `select action, detail from audit_log where action = 'project.folders' order by created_at`,
    )
    expect(rows.map((row) => row.detail.action)).toEqual(['claim', 'release'])
  })
})

/** Ids are not part of the public surface; the test reaches them the way the UI does. */
async function folderIds(userId: string): Promise<string[]> {
  return withUser(userId, async (client) => {
    const { rows } = await client.query<{ id: string }>(`select id from project_folders order by path`)
    return rows.map((row) => row.id)
  })
}
