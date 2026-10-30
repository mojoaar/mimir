import { beforeEach, describe, expect, it } from 'vitest'

import { resetFixtures, seedTwoUsersWithProjects } from '@/lib/db/seed'

import { projectRole } from './access'
import { listAccessRequests, myAccessRequests, requestAccess, resolveAccessRequest } from './requests'
import { resolveProject } from './service'

let alice: string
let bob: string
let carol: string
let projectId: string

const REPO = 'github.com/alice/shared'

beforeEach(async () => {
  await resetFixtures()
  ;({ alice, bob, carol } = await seedTwoUsersWithProjects())
  projectId = (await resolveProject(alice, { repo: REPO, create: true })).id
})

describe('asking for access', () => {
  it('leaves one pending request the owner can see', async () => {
    expect(await requestAccess(bob, REPO, 'we work on the same repo')).toBe('requested')

    const requests = await listAccessRequests(alice, projectId)
    expect(requests).toHaveLength(1)
    expect(requests[0]?.email).toBe('bob@example.test')
    expect(requests[0]?.note).toBe('we work on the same repo')
  })

  it('does not add a second pending request', async () => {
    await requestAccess(bob, REPO, 'first')
    expect(await requestAccess(bob, REPO, 'second')).toBe('already')

    expect(await listAccessRequests(alice, projectId)).toHaveLength(1)
  })

  it('says already for the owner, who has access without asking', async () => {
    expect(await requestAccess(alice, REPO)).toBe('already')
    expect(await listAccessRequests(alice, projectId)).toHaveLength(0)
  })

  it('refuses a folder, because only a repository can be looked up', async () => {
    await expect(requestAccess(bob, '/Users/bob/AI')).rejects.toThrow(/repository, not a folder/)
  })

  it('refuses a repository no project answers for', async () => {
    await expect(requestAccess(bob, 'github.com/nobody/nothing')).rejects.toThrow(
      /no project answers for that repository/,
    )
  })
})

describe('answering a request', () => {
  it('gives the requester write access when granted', async () => {
    await requestAccess(bob, REPO)
    const [request] = await listAccessRequests(alice, projectId)

    await resolveAccessRequest(alice, request!.id, 'grant')

    expect(await projectRole(bob, projectId)).toBe('write')
    expect(await listAccessRequests(alice, projectId)).toHaveLength(0)
  })

  it('leaves the requester without access when declined', async () => {
    await requestAccess(bob, REPO)
    const [request] = await listAccessRequests(alice, projectId)

    await resolveAccessRequest(alice, request!.id, 'decline')

    expect(await projectRole(bob, projectId)).toBeNull()
    expect(await listAccessRequests(alice, projectId)).toHaveLength(0)
  })

  it('refuses a caller who does not own the project', async () => {
    await requestAccess(bob, REPO)
    const [request] = await listAccessRequests(alice, projectId)

    await expect(resolveAccessRequest(bob, request!.id, 'grant')).rejects.toMatchObject({
      code: 'forbidden',
    })
    // A stranger cannot see the row at all, so the answer is the same one an
    // already-answered request gets: no way to probe for open questions.
    await expect(resolveAccessRequest(carol, request!.id, 'grant')).rejects.toMatchObject({
      code: 'invalid_params',
    })
    expect(await projectRole(bob, projectId)).toBeNull()
  })
})

describe('my requests', () => {
  it('lists what the caller asked for, with the repository and the answer', async () => {
    await requestAccess(bob, REPO, 'need the deploy notes')
    const mine = await myAccessRequests(bob)
    expect(mine).toHaveLength(1)
    expect(mine[0]?.repoKey).toBe('github.com/alice/shared')
    expect(mine[0]?.decision).toBeNull()
    expect(await myAccessRequests(alice)).toEqual([])
  })
})
