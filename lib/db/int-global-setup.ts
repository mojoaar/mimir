import './test-setup'
import { closePools } from './pool'
import { runMigrations } from './migrate'

// A worker that starts before the schema exists fails on `relation "users"
// does not exist`, and the hermetic migration test drops and recreates the
// schema while its neighbours run. Both are avoided by migrating once, up
// front, and running the integration files one at a time.
export default async function setup(): Promise<void> {
  await runMigrations()
  await closePools()
}
