import { closePools } from '../lib/db/pool'
import { runMigrations } from '../lib/db/migrate'

runMigrations()
  .then(async ({ applied }) => {
    console.log(applied.length === 0 ? 'no pending migrations' : `applied: ${applied.join(', ')}`)
    await closePools()
  })
  .catch(async (error: unknown) => {
    console.error((error as Error).message)
    await closePools().catch(() => undefined)
    process.exit(1)
  })
