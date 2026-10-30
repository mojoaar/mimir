import { beforeEach, describe, expect, it } from 'vitest'

import { adminPool } from '@/lib/db/pool'
import { resetFixtures, seedTwoUsersWithProjects, type Fixtures } from '@/lib/db/seed'
import { writeMemory } from './service'
import { exportProject } from './export'

let f: Fixtures
let projectId: string

beforeEach(async () => {
  await resetFixtures()
  f = await seedTwoUsersWithProjects()
  projectId = f.aliceProjectId
})

describe('exportProject', () => {
  it('writes every memory as markdown and as json', async () => {
    await writeMemory({ userId: f.alice, projectId, path: 'deploy/rollback', body: 'redeploy the previous image', kind: 'procedure' })
    await writeMemory({ userId: f.alice, projectId, path: 'auth/keys', body: 'keys rotate every ninety days' })
    await adminPool().query('update memories set summary = $1 where project_id = $2 and path = $3', [
      'Roll back by redeploying',
      projectId,
      'auth/keys',
    ])

    const exported = await exportProject(f.alice, projectId)

    expect(exported.filename).toMatch(/\.md$/)
    expect(exported.markdown).toContain('## deploy/rollback')
    expect(exported.markdown).toContain('## auth/keys')
    expect(exported.markdown).toContain('redeploy the previous image')

    const json = JSON.parse(exported.json) as {
      memoryCount: number
      memories: { path: string; body: string; kind: string; summary: string | null; client: string | null; updatedAt: string }[]
    }
    expect(json.memoryCount).toBe(2)
    const rollback = json.memories.find((m) => m.path === 'deploy/rollback')
    expect(rollback?.kind).toBe('procedure')
    expect(rollback?.body).toBe('redeploy the previous image')
    expect(rollback?.client).toBeNull()
    expect(typeof rollback?.updatedAt).toBe('string')
    expect(json.memories.find((m) => m.path === 'auth/keys')?.summary).toBe('Roll back by redeploying')
  })

  it('refuses a caller who cannot read the project', async () => {
    await expect(exportProject(f.bob, projectId)).rejects.toMatchObject({ code: 'forbidden' })
  })
})
