import { beforeEach, describe, expect, it } from 'vitest'
import { withAdmin } from '@/lib/db/tx'
import { resetFixtures, seedTwoUsersWithProjects, type Fixtures } from '@/lib/db/seed'
import { deleteMemory, writeMemory } from '@/lib/memory/service'
import { runPurge } from './purge'

let f: Fixtures
let projectId: string

beforeEach(async () => {
  await resetFixtures()
  f = await seedTwoUsersWithProjects()
  projectId = f.aliceProjectId
})

async function purgeAudits(): Promise<number> {
  const { rows } = await withAdmin((tx) =>
    tx.query<{ n: string }>(`select count(*)::text as n from audit_log where action = 'memory.purge'`),
  )
  return Number(rows[0]?.n ?? 0)
}

describe('purge job', () => {
  it('removes only memories past the window and records what it did', async () => {
    await writeMemory({ userId: f.alice, projectId, path: 'a/gone', body: 'gone' })
    await deleteMemory(f.alice, projectId, 'a/gone')

    expect(await runPurge()).toEqual({ removed: 0, versionsRemoved: 0 })
    expect(await purgeAudits()).toBe(1)

    expect(await runPurge(new Date(Date.now() + 31 * 86_400_000))).toEqual({
      removed: 1,
      versionsRemoved: 0,
    })
    expect(await purgeAudits()).toBe(2)

    const { rows } = await withAdmin((tx) =>
      tx.query<{ n: string }>('select count(*)::text as n from memories where project_id = $1', [projectId]),
    )
    expect(rows[0]?.n).toBe('0')
  })

  it('prunes version history and takes a purged memory’s history with it', async () => {
    for (let i = 0; i < 23; i += 1) {
      await writeMemory({ userId: f.alice, projectId, path: 'a/many', body: `body ${i}` })
    }
    await writeMemory({ userId: f.alice, projectId, path: 'a/gone', body: 'first' })
    await writeMemory({ userId: f.alice, projectId, path: 'a/gone', body: 'second' })
    await deleteMemory(f.alice, projectId, 'a/gone')

    const result = await runPurge(new Date(Date.now() + 31 * 86_400_000))

    expect(result).toEqual({ removed: 1, versionsRemoved: 2 })
    const { rows } = await withAdmin((tx) =>
      tx.query<{ live: string; gone: string }>(
        `select
           (select count(*)::text from memory_versions v join memories m on m.id = v.memory_id where m.path = 'a/many') as live,
           (select count(*)::text from memory_versions where path = 'a/gone') as gone`,
      ),
    )
    expect(rows[0]?.live).toBe('20')
    expect(rows[0]?.gone).toBe('0')
  })
})
