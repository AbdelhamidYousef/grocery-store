import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Integration tests share one Postgres database; running files in parallel would let one
    // file's inserts or truncates leak into another.
    fileParallelism: false,
  },
});
