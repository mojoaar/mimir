import { audit } from '../audit'
import { purgeDeletedMemories } from '../memory/service'
import { registerWorker } from './boss'

export type PurgeResult = { removed: number }

/**
 * Hard-deletes memories that have been soft-deleted for longer than the
 * recovery window. Install-wide, so it runs as a job rather than as a user.
 */
export async function runPurge(now: Date = new Date()): Promise<PurgeResult> {
  const result = await purgeDeletedMemories(now)
  await audit({
    actorType: 'system',
    actorId: null,
    action: 'memory.purge',
    targetType: 'memory',
    detail: { removed: result.removed },
  })
  if (result.removed > 0) console.log(`mimir: purged ${result.removed} deleted memor${result.removed === 1 ? 'y' : 'ies'}`)
  return result
}

registerWorker('purge', async () => {
  await runPurge()
})
