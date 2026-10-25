import { audit } from '../audit'
import { purgeDeletedMemories } from '../memory/service'
import { pruneVersions } from '../memory/versions'
import { registerWorker } from './boss'

export type PurgeResult = { removed: number; versionsRemoved: number }

/**
 * Hard-deletes memories that have been soft-deleted for longer than the
 * recovery window, then trims version history to the newest VERSION_LIMIT per
 * memory. Install-wide, so it runs as a job rather than as a user.
 */
export async function runPurge(now: Date = new Date()): Promise<PurgeResult> {
  const result = await purgeDeletedMemories(now)
  // After the delete: purging a memory cascades its versions away already, so
  // this only counts what the retention rule removes.
  const versionsRemoved = await pruneVersions()

  await audit({
    actorType: 'system',
    actorId: null,
    action: 'memory.purge',
    targetType: 'memory',
    detail: { removed: result.removed, versionsRemoved },
  })
  if (result.removed > 0) {
    console.log(
      `mimir: purged ${result.removed} deleted memor${result.removed === 1 ? 'y' : 'ies'}`,
    )
  }
  if (versionsRemoved > 0) {
    console.log(`mimir: pruned ${versionsRemoved} old version${versionsRemoved === 1 ? '' : 's'}`)
  }
  return { removed: result.removed, versionsRemoved }
}

registerWorker('purge', async () => {
  await runPurge()
})
