import { PgBoss } from 'pg-boss'
import { getConfig } from '../config'

export type JobName =
  | 'extract'
  | 'learn'
  | 'backfill'
  | 'reembed'
  | 'reconcile'
  | 'backup'
  | 'prune'
  | 'purge'

// `short` keeps one queued job per singletonKey, which is what makes the
// extract debounce work: the tenth write in a minute reuses the first job, and
// a hundred writes during an embedding outage queue one backfill, not a hundred.
const POLICIES: Record<JobName, 'short' | 'standard'> = {
  extract: 'short',
  learn: 'standard',
  backfill: 'short',
  reembed: 'standard',
  reconcile: 'standard',
  backup: 'standard',
  prune: 'standard',
  purge: 'standard',
}

const JOB_NAMES = Object.keys(POLICIES) as JobName[]

// Whatever a handler returns is what pg-boss stores as the job's output, so a
// finished job can say "12 embedded" instead of just "completed".
type Handler = (data: Record<string, unknown>) => Promise<unknown>

type JobState = {
  boss: PgBoss | null
  starting: Promise<void> | null
  workers: Map<JobName, Handler>
}

// Next bundles the instrumentation hook and the route handlers separately, so
// module scope here is not shared with the code that enqueues jobs. Keying the
// state on globalThis is what makes one started queue visible to every bundle
// in the process. `Symbol.for` reaches the same key from any module instance.
const STATE = Symbol.for('mimir.jobs.state')

function state(): JobState {
  const global = globalThis as typeof globalThis & { [STATE]?: JobState }
  global[STATE] ??= { boss: null, starting: null, workers: new Map() }
  return global[STATE]
}

export function registerWorker(name: JobName, handler: Handler): void {
  state().workers.set(name, handler)
}

/**
 * Starts the queue and every worker registered so far. Idempotent: a second
 * call while running, or while the first is still in flight, does nothing.
 *
 * The owner connection string is deliberate - pg-boss creates and migrates its
 * own schema, and the runtime role has no DDL.
 */
export async function startJobs(): Promise<void> {
  const jobs = state()
  if (jobs.boss) return
  if (jobs.starting) return jobs.starting

  jobs.starting = (async () => {
    const instance = new PgBoss({
      connectionString: getConfig().databaseAdminUrl,
      max: 3,
    })
    // A queue error must never take the web process down with it.
    instance.on('error', (error) => {
      // Connection-level errors can carry the connection string, so only the message.
      console.error(`mimir: job queue error (${(error as Error).message})`)
    })

    await instance.start()
    for (const name of JOB_NAMES) {
      await instance.createQueue(name, { policy: POLICIES[name] })
    }
    for (const [name, handler] of jobs.workers) {
      // pg-boss hands the worker an array of jobs; we process one at a time.
      await instance.work(name, async ([job]) => handler((job?.data ?? {}) as Record<string, unknown>))
    }

    jobs.boss = instance
    // Imported lazily: the job module imports getBoss from this file.
    const { scheduleBackups } = await import('./backup')
    try {
      await scheduleBackups()
    } catch (error) {
      // A rejected cron would otherwise abort startJobs and leave every job
      // unscheduled, including the audit prune.
      console.error(`mimir: could not schedule backups (${(error as Error).message})`)
    }
    await instance.schedule('prune', '15 3 * * *', {})
    await instance.schedule('purge', '20 4 * * *', {})
    // After purge, so the sweep does not race a soft delete.
    await instance.schedule('reconcile', '40 4 * * *', {})
    process.once('SIGTERM', () => void stopJobs())
    process.once('SIGINT', () => void stopJobs())
  })()

  try {
    await jobs.starting
  } finally {
    jobs.starting = null
  }
}

export async function stopJobs(): Promise<void> {
  const jobs = state()
  const instance = jobs.boss
  jobs.boss = null
  if (instance) await instance.stop()
}

export function getBoss(): PgBoss {
  const jobs = state()
  if (!jobs.boss) {
    const error = new Error('jobs_not_started') as Error & { code: string }
    error.code = 'jobs_not_started'
    throw error
  }
  return jobs.boss
}

/** Re-reads the backup schedule after settings change. A no-op when jobs are not running. */
export async function rescheduleBackups(): Promise<void> {
  const { scheduleBackups } = await import('./backup')
  await scheduleBackups()
}

/** Returns null when the job was throttled away or the queue is not running. */
export async function sendJob(
  name: JobName,
  data: Record<string, unknown>,
  options: { startAfter?: number; singletonKey?: string } = {},
): Promise<string | null> {
  const jobs = state()
  if (!jobs.boss) return null
  return jobs.boss.send(name, data, {
    startAfter: options.startAfter,
    singletonKey: options.singletonKey,
  })
}
