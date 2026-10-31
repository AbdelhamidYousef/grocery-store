import { readFileSync } from 'node:fs';

// Read from package.json at startup instead of importing it: a JSON import would drag the file
// into the compiler's rootDir. The file sits at a different depth when run from `src/lib/` (tsx)
// and from `dist/` (the bundle), so walk up until the API's own package.json is found.
function readVersion(): string {
  let dir = new URL('./', import.meta.url);
  for (let i = 0; i < 4; i++) {
    try {
      const raw: unknown = JSON.parse(readFileSync(new URL('package.json', dir), 'utf8'));
      if (typeof raw === 'object' && raw !== null && 'name' in raw && raw.name === '@store/api') {
        return 'version' in raw && typeof raw.version === 'string' ? raw.version : 'unknown';
      }
    } catch {
      // no package.json at this level: keep walking up
    }
    dir = new URL('../', dir);
  }
  return 'unknown';
}

export const version: string = readVersion();
