import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { compileMigrations } from '../../../packages/electron/scripts/compile-migrations.mjs';

const migrationsDir = path.resolve(
  __dirname,
  '../../../packages/core/src/infrastructure/persistence/sqlite/migrations'
);

const RELATIVE_REQUIRE = /\brequire\(\s*["']\.{1,2}\//;

const topLevelMigrations = () =>
  readdirSync(migrationsDir).filter((f) => /^\d+-.+\.ts$/.test(f) && !f.endsWith('.d.ts'));

describe('compileMigrations', () => {
  let outDir: string;

  beforeAll(async () => {
    outDir = mkdtempSync(path.join(tmpdir(), 'shep-migrations-'));
    await compileMigrations({ srcDir: migrationsDir, outDir, logLevel: 'silent' });
  }, 60_000);

  afterAll(() => rmSync(outDir, { recursive: true, force: true }));

  it('emits one CommonJS file per top-level migration', () => {
    const emitted = readdirSync(outDir).filter((f) => f.endsWith('.js'));
    expect(emitted.sort()).toEqual(topLevelMigrations().map((f) => f.replace(/\.ts$/, '.js')));
    expect(JSON.parse(readFileSync(path.join(outDir, 'package.json'), 'utf8'))).toEqual({
      type: 'commonjs',
    });
  });

  // The packaged app ships only these files, so a relative require left in one fails at
  // startup ("Cannot find module './data/compliance-control-seed.js'").
  it('inlines every relative import so no output requires a sibling file', () => {
    for (const file of readdirSync(outDir).filter((f) => f.endsWith('.js'))) {
      const code = readFileSync(path.join(outDir, file), 'utf8');
      expect(RELATIVE_REQUIRE.test(code), `${file} still requires a relative path`).toBe(false);
    }
  });

  it('keeps npm packages external', () => {
    const code = readFileSync(path.join(outDir, '115-create-compliance-controls.js'), 'utf8');
    expect(code).not.toMatch(/node_modules/);
  });
});
