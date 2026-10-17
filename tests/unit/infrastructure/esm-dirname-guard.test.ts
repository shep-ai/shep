/**
 * The package is `"type": "module"`, so `__dirname` does not exist at runtime
 * in the built CLI. Vitest and tsx inject it, which is why a module that uses it
 * bare passes every test and still crashes the published worker at boot
 * (`decision-tool-startup.ts`, 1.238.0–1.242.0). Every source module that
 * reads `__dirname` must derive it from `import.meta.url` itself.
 */
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOTS = ['packages/core/src', 'src'];
const SOURCE_FILE = /\.(ts|tsx)$/;
const NOT_RUNTIME = /\.(test|spec|stories)\.tsx?$|\.d\.ts$/;
const SKIPPED_DIRS = new Set(['node_modules', '.next', 'generated']);
const DECLARES_DIRNAME = /\b(const|let|var)\s+__dirname\b/;
const USES_DIRNAME = /\b__dirname\b/;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return SKIPPED_DIRS.has(entry.name) ? [] : sourceFiles(path);
    return SOURCE_FILE.test(entry.name) && !NOT_RUNTIME.test(entry.name) ? [path] : [];
  });
}

function withoutComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

describe('ESM __dirname guard', () => {
  it('every runtime module that reads __dirname declares it from import.meta.url', () => {
    const offenders = ROOTS.flatMap((root) => sourceFiles(join(process.cwd(), root)))
      .filter((file) => {
        const code = withoutComments(readFileSync(file, 'utf8'));
        return USES_DIRNAME.test(code) && !DECLARES_DIRNAME.test(code);
      })
      .map((file) => relative(process.cwd(), file).replace(/\\/g, '/'));

    expect(offenders).toEqual([]);
  });
});
