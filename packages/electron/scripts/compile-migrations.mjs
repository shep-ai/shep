/**
 * Compiles the core SQLite migrations for the Electron bundle.
 *
 * `getMigrationsDir()` in core resolves `migrations/` next to the compiled
 * bundle (`dist/main.cjs` → `dist/migrations/`), and Node cannot import `.ts`,
 * so each top-level migration is compiled to its own self-contained CommonJS
 * `.js` file.
 * Without this, migrations 035+ never run and startup crashes on a fresh
 * SHEP_HOME.
 */

import { readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { build } from 'esbuild';

const MIGRATION_FILE = /^\d+-.+\.ts$/;

/**
 * @param {{ srcDir: string, outDir: string, logLevel?: import('esbuild').LogLevel }} options
 * @returns {Promise<number>} How many migrations were compiled.
 */
export async function compileMigrations({ srcDir, outDir, logLevel = 'info' }) {
  const entryPoints = readdirSync(srcDir)
    .filter((f) => MIGRATION_FILE.test(f) && !f.endsWith('.d.ts'))
    .map((f) => path.join(srcDir, f));
  if (entryPoints.length === 0) return 0;

  await build({
    entryPoints,
    // Inline each migration's relative imports (./data/*, ../add-column, generated
    // domain enums): only these files ship, so a sibling require would not resolve.
    bundle: true,
    packages: 'external',
    platform: 'node',
    target: 'node22',
    format: 'cjs',
    outdir: outDir,
    sourcemap: true,
    logLevel,
  });

  // Electron's package.json declares "type": "module", so Node treats plain .js
  // files as ESM and refuses `module.exports`. A directory-local package.json
  // pins CommonJS for every file here without changing migration extensions.
  writeFileSync(path.join(outDir, 'package.json'), JSON.stringify({ type: 'commonjs' }, null, 2));
  return entryPoints.length;
}
