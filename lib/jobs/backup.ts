import { getBoss, registerWorker } from './boss'
import { getBackupSettings } from '../settings/backup-settings'
import { runBackup } from '../backup/run'

const BACKUP_JOB = 'backup'

/**
 * Applies the schedule from settings. Idempotent: pg-boss keys a schedule by
 * name, so calling this twice replaces the cron instead of duplicating it.
 */
export async function scheduleBackups(): Promise<void> {
  let boss
  try {
    boss = getBoss()
  } catch {
    // The queue is not running (build, tests, a failed boot): nothing to do.
    return
  }
  const settings = await getBackupSettings()
  if (settings.enabled) {
    await boss.schedule(BACKUP_JOB, settings.schedule, {})
  } else {
    await boss.unschedule(BACKUP_JOB)
  }
}

registerWorker(BACKUP_JOB, async () => {
  await runBackup({ triggeredBy: 'schedule' })
})
