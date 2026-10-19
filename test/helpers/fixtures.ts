import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/** Reads and parses `test/fixtures/<relPath>` (cwd is the repo root under Vitest). */
export function loadJson(relPath: string): unknown {
  return JSON.parse(readFileSync(join(process.cwd(), 'test', 'fixtures', relPath), 'utf8'));
}
