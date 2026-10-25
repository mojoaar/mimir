import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: { alias: { '@': fileURLToPath(new URL('.', import.meta.url)) } },
  test: {
    include: ['**/*.int.test.ts'],
    exclude: ['node_modules', '.next/**'],
    setupFiles: ['./lib/db/test-setup.ts'],
    testTimeout: 20000,
    hookTimeout: 20000,
  },
})
