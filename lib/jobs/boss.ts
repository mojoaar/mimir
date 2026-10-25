import { PgBoss } from 'pg-boss'
import { getConfig } from '../config'

export type JobName = 'extract' | 'backfill' | 'reembed'

// `short` keeps one queued job per singletonKey, which is what makes the
// extract debounce work: the tenth write in a minute reuses the first job.
const POLICIES: Record<JobName, 'short' | 'standard'> = {
  extract: 'short',
  backfill: 'standard',
  reembed: 'standard',
}

const JOB_NAMES = Object.keys(POLICIES) as JobName[]

type Handler = (data: Record<string, unknown>) => Promise<void>

const workers = new Map<JobName, Handler>()

let boss: PgBoss | null = null
let starting: Promise<void> | null = null

export function registerWorker(name: JobName, handler: Handler): void {
  workers.set(name, handler)
}

/**
 * Starts the queue and every worker registered so far. Idempotent: a second
 * call while running, or while the first is still in flight, does nothing.
 *
 * The owner connection string is deliberate — pg-boss creates and migrates its
 * own schema, and the runtime role has no DDL.
 */
export async function startJobs(): Promise<void> {
  if (boss) return
  if (starting) return starting

  starting = (async () => {
    const instance = new PgBoss({
      connectionString: getConfig().databaseAdminUrl,
      max: 3,
    })
    // A queue error must never take the web process down with it.
    instance.on('error', (error) => {
      console.error('mimir: job queue error', error)
    })

    await instance.start()
    for (const name of JOB_NAMES) {
      await instance.createQueue(name, { policy: POLICIES[name] })
    }
    for (const [name, handler] of workers) {
      // pg-boss hands the worker an array of jobs; we process one at a time.
      await instance.work(name, async ([job]) => {
        await handler((job?.data ?? {}) as Record<string, unknown>)
      })
    }

    boss = instance
    process.once('SIGTERM', () => void stopJobs())
    process.once('SIGINT', () => void stopJobs())
  })()

  try {
    await starting
  } finally {
    starting = null
  }
}

export async function stopJobs(): Promise<void> {
  const instance = boss
  boss = null
  if (instance) await instance.stop()
}

export function getBoss(): PgBoss {
  if (!boss) {
    const error = new Error('jobs_not_started') as Error & { code: string }
    error.code = 'jobs_not_started'
    throw error
  }
  return boss
}

/** Returns null when the job was throttled away or the queue is not running. */
export async function sendJob(
  name: JobName,
  data: Record<string, unknown>,
  options: { startAfter?: number; singletonKey?: string } = {},
): Promise<string | null> {
  if (!boss) return null
  return boss.send(name, data, {
    startAfter: options.startAfter,
    singletonKey: options.singletonKey,
  })
}
