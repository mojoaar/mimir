import './test-setup'
import { closePools } from './pool'
import { runMigrations } from './migrate'
import { startJobs, stopJobs } from '@/lib/jobs/boss'

// A worker that starts before the schema exists fails on `relation "users"
// does not exist`, and the hermetic migration test drops and recreates the
// schema while its neighbours run. Both are avoided by migrating once, up
// front, and running the integration files one at a time.
export default async function setup(): Promise<void> {
  await runMigrations()
  // The job read-model suite queries pgboss.job, a table only the queue
  // creates. A fresh CI database has never run the app, so make it here once.
  await startJobs()
  await stopJobs()
  await closePools()
}
