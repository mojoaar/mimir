// Boot sequence: fail fast on bad config, migrate under an advisory lock, create
// the first admin once. Runs inside the server process, before it serves.
export async function register() {
  // The edge runtime has no Postgres driver and never runs this file.
  if (process.env.NEXT_RUNTIME !== 'nodejs') return

  const { loadConfig } = await import('./lib/config')
  const { runMigrations } = await import('./lib/db/migrate')
  const { ensureBootstrapAdmin } = await import('./lib/auth/bootstrap')

  const config = loadConfig()
  const { applied } = await runMigrations()
  if (applied.length > 0) console.log(`mimir: applied ${applied.length} migration(s)`)

  await ensureBootstrapAdmin(config)

  // Importing a job module is what registers its worker; startJobs then starts
  // only the workers that exist. Jobs run in this process, so a crash mid-job is
  // retried by pg-boss on the next boot rather than lost. The extract and backfill
  // modules are imported here as they land (tasks 9 and 10).
  const { startJobs } = await import('./lib/jobs/boss')
  await startJobs()

  console.log(`mimir: ready at ${config.publicUrlSeed ?? 'http://localhost:3000'}`)
}
