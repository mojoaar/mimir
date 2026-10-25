// Runs in every integration-test worker before test modules are imported, so
// config validation and pool creation see the test database rather than dev.
const app = process.env.MIMIR_TEST_DATABASE_URL ?? 'postgres://mimir_app:app_dev_password@127.0.0.1:5433/mimir_test'
const owner =
  process.env.MIMIR_TEST_DATABASE_ADMIN_URL ?? 'postgres://mimir_owner:owner_dev_password@127.0.0.1:5433/mimir_test'

process.env.MIMIR_SECRET = 'a'.repeat(64)
process.env.DATABASE_URL = app
process.env.DATABASE_ADMIN_URL = owner
