import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    setupFiles: ['test/setup.ts'],
    environment: 'node',
    // Tests share one fake AI server and one database, so run files one at a time.
    fileParallelism: false,
    testTimeout: 20_000,
  },
})
