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
  console.log(`mimir: ready at ${config.publicUrlSeed ?? 'http://localhost:3000'}`)
}
