import { beforeEach, describe, expect, it } from 'vitest'
import { resetFixtures, seedTwoUsersWithProjects, type Fixtures } from '@/lib/db/seed'
import type { AuthUser } from '@/lib/auth/types'
import { handleRpc } from '@/lib/mcp/server'
import { learningReadiness } from './learning'
import { resolveProject, updateProjectSettings } from './service'

let f: Fixtures
let alice: AuthUser

const meta = { ip: '10.0.0.1', userAgent: 'vitest' }

const asUser = (id: string, email: string): AuthUser => ({
  id,
  email,
  name: '',
  role: 'user',
  status: 'active',
  mfaEnabled: false,
  locale: 'en',
})

const learn = async (args: Record<string, unknown>) =>
  (await handleRpc(
    { jsonrpc: '2.0', id: 9, method: 'tools/call', params: { name: 'memory_learn', arguments: args } },
    alice,
    meta,
  )) as { result?: { queued?: boolean; reason?: string } }

const transcript = 'a decision worth keeping '.repeat(40)

beforeEach(async () => {
  await resetFixtures()
  f = await seedTwoUsersWithProjects()
  alice = asUser(f.alice, f.email)
})

describe('learning readiness', () => {
  it('is not ready while learning is off', async () => {
    const project = await resolveProject(alice.id, { repo: 'github.com/alice/off', create: true })

    expect(await learningReadiness(project.id)).toEqual({ learning: false, provider: false })
  })

  it('is not ready while no language provider resolves', async () => {
    const project = await resolveProject(alice.id, { repo: 'github.com/alice/no-provider', create: true })
    await updateProjectSettings(alice.id, project.id, { learningEnabled: true })

    expect(await learningReadiness(project.id)).toEqual({ learning: true, provider: false })
  })
})

describe('memory_learn', () => {
  it('says learning is off instead of queueing', async () => {
    const reply = await learn({ repo: 'github.com/alice/off', transcript })

    expect(reply.result).toMatchObject({ queued: false, reason: 'learning is off for this project' })
  })

  it('says no provider is configured instead of queueing', async () => {
    const project = await resolveProject(alice.id, { repo: 'github.com/alice/bare', create: true })
    await updateProjectSettings(alice.id, project.id, { learningEnabled: true })

    const reply = await learn({ project: project.slug, transcript })

    expect(reply.result).toMatchObject({ queued: false, reason: 'no language provider is configured' })
  })
})
