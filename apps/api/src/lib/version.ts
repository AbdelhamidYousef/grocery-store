import { readFileSync } from 'node:fs';

// Read from package.json at startup instead of importing it: a JSON import would drag the file
// into the compiler's rootDir. `../package.json` resolves to the same file from `src/` (tsx) and
// from `dist/` (built), because both sit directly under apps/api.
const raw: unknown = JSON.parse(
  readFileSync(new URL('../../package.json', import.meta.url), 'utf8'),
);

export const version: string =
  typeof raw === 'object' && raw !== null && 'version' in raw && typeof raw.version === 'string'
    ? raw.version
    : 'unknown';
