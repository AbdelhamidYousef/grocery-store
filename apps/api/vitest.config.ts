import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Migrates the test database once before anything runs.
    globalSetup: ['./src/test/global-setup.ts'],
    // Truncates all tables before every test, in every file.
    setupFiles: ['./src/test/setup.ts'],
    // Integration tests share one Postgres database; running files in parallel would let one
    // file's inserts or truncates leak into another.
    fileParallelism: false,
  },
});
