import 'reflect-metadata';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { RunPlanStalenessProbe } from '@/infrastructure/services/deployment/run-plan-staleness-probe.js';
import { computeConfigHash } from '@/infrastructure/services/deployment/config-hash.js';

const APPLICATION_DIR = fileURLToPath(
  new URL('../../../../../packages/core/src/application', import.meta.url)
);

describe('RunPlanStalenessProbe', () => {
  let repoPath: string;
  let probe: RunPlanStalenessProbe;

  beforeEach(() => {
    repoPath = mkdtempSync(join(tmpdir(), 'shep-staleness-'));
    probe = new RunPlanStalenessProbe();
  });

  afterEach(() => {
    rmSync(repoPath, { recursive: true, force: true });
  });

  describe('currentConfigHash', () => {
    it('returns the same digest computeConfigHash produces for the directory', () => {
      writeFileSync(join(repoPath, 'package.json'), '{"scripts":{"dev":"vite"}}');

      expect(probe.currentConfigHash(repoPath)).toBe(computeConfigHash(repoPath));
    });

    it('changes when a tracked manifest changes', () => {
      writeFileSync(join(repoPath, 'package.json'), '{"scripts":{"dev":"vite"}}');
      const before = probe.currentConfigHash(repoPath);

      writeFileSync(join(repoPath, 'package.json'), '{"scripts":{"dev":"next dev"}}');

      expect(probe.currentConfigHash(repoPath)).not.toBe(before);
    });

    it('degrades to an empty digest rather than throwing for an unreadable path', () => {
      expect(probe.currentConfigHash(join(repoPath, 'does', 'not', 'exist'))).toBe(
        computeConfigHash(join(repoPath, 'does', 'not', 'exist'))
      );
    });
  });

  describe('hasRepoDevConfig', () => {
    it('is false when no .shep/dev.json exists', () => {
      expect(probe.hasRepoDevConfig(repoPath)).toBe(false);
    });

    it('is true for a valid committed .shep/dev.json', () => {
      mkdirSync(join(repoPath, '.shep'), { recursive: true });
      writeFileSync(join(repoPath, '.shep', 'dev.json'), JSON.stringify({ command: 'make dev' }));

      expect(probe.hasRepoDevConfig(repoPath)).toBe(true);
    });

    it('is false for a malformed .shep/dev.json rather than throwing', () => {
      mkdirSync(join(repoPath, '.shep'), { recursive: true });
      writeFileSync(join(repoPath, '.shep', 'dev.json'), '{ not json');

      expect(probe.hasRepoDevConfig(repoPath)).toBe(false);
    });
  });
});

describe('application layer dependency rule', () => {
  it('never imports from infrastructure/', async () => {
    const offenders: string[] = [];

    for (const file of await collectTypeScriptFiles(APPLICATION_DIR)) {
      const source = await readFile(file, 'utf8');
      if (/from\s+['"][^'"]*infrastructure\//.test(source)) {
        offenders.push(file);
      }
    }

    expect(offenders).toEqual([]);
  });

  it('never calls computeConfigHash — staleness arrives through the probe port', async () => {
    const offenders: string[] = [];

    for (const file of await collectTypeScriptFiles(APPLICATION_DIR)) {
      const source = await readFile(file, 'utf8');
      // A call site or a binding — prose in a doc comment is fine.
      if (/computeConfigHash\s*[(,}]/.test(source)) offenders.push(file);
    }

    expect(offenders).toEqual([]);
  });
});

async function collectTypeScriptFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectTypeScriptFiles(full)));
    } else if (entry.name.endsWith('.ts')) {
      files.push(full);
    }
  }

  return files;
}
