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
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      // Tests, test helpers, the process entry point and the migration/seed/reset scripts are run
      // by hand or by tests as tooling; counting them would hide the gaps in real code.
      exclude: [
        'src/**/*.test.ts',
        'src/test/**',
        // Pure table declarations: the only "functions" are relation callbacks that Drizzle calls
        // lazily, and every query in every test already goes through them.
        'src/db/schema/**',
        'src/index.ts',
        'src/db/migrate.ts',
        'src/db/reset.ts',
        'src/db/seed/index.ts',
      ],
      reporter: ['text-summary', 'text', 'json-summary'],
    },
  },
});
