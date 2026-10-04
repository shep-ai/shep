/**
 * Architecture guard (spec 121): the Shep home is found in exactly one place.
 *
 * Joining homedir() with '.shep' ignores SHEP_HOME (so tests write into the
 * real ~/.shep), and reading process.env.HOME breaks on Windows, where HOME is
 * usually unset. Everything goes through getShepHomeDir() in
 * infrastructure/services/filesystem/shep-directory.service.ts.
 */
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = join(import.meta.dirname, '../../..');
const SOURCES = [join(ROOT, 'packages/core/src'), join(ROOT, 'src')];
const CANONICAL = 'packages/core/src/infrastructure/services/filesystem/shep-directory.service.ts';

/** homedir() (or os.homedir()) followed by '.shep' in the same call. */
const HOMEDIR_SHEP = /homedir\(\)\s*,\s*['"]\.shep['"]/;
/** A Shep-home fallback built from the HOME variable. */
const HOME_ENV_SHEP = /process\.env\.HOME\b[^\n]*['"]\.shep['"]/;

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    if (name === 'node_modules' || name === '.next') return [];
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return files(full);
    return /\.(ts|tsx)$/.test(name) ? [full] : [];
  });
}

describe('Shep home resolution', () => {
  it('no source file builds the Shep home from homedir() or HOME', () => {
    const offenders = SOURCES.flatMap(files)
      .filter((file) => relative(ROOT, file) !== CANONICAL)
      .filter((file) => {
        const text = readFileSync(file, 'utf8');
        return HOMEDIR_SHEP.test(text) || HOME_ENV_SHEP.test(text);
      })
      .map((file) => relative(ROOT, file));
    expect(offenders).toEqual([]);
  });
});
