/**
 * OwnershipYamlReader integration tests (feature 098, phase 2).
 *
 * Verifies the adapter reads `.shep/ownership.yaml` correctly, returns an
 * empty document on missing file, and silently tolerates malformed entries
 * (skipping bad rows rather than throwing).
 */

import 'reflect-metadata';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { OwnershipYamlReader } from '@/infrastructure/services/aspm/ownership-yaml-reader.js';

describe('OwnershipYamlReader', () => {
  let repoRoot: string;
  const reader = new OwnershipYamlReader();

  beforeEach(() => {
    repoRoot = mkdtempSync(join(tmpdir(), 'shep-aspm-yaml-'));
  });

  afterEach(() => {
    rmSync(repoRoot, { recursive: true, force: true });
  });

  it('returns the fixture file contents', async () => {
    const shepDir = join(repoRoot, '.shep');
    mkdirSync(shepDir, { recursive: true });
    writeFileSync(
      join(shepDir, 'ownership.yaml'),
      [
        'entries:',
        '  - pathGlob: "src/api/**"',
        '    ownerId: "owner-api"',
        '    teamId: "team-platform"',
        '    businessUnitId: "bu-engineering"',
        '  - pathGlob: "src/web/**"',
        '    ownerId: "owner-web"',
      ].join('\n')
    );

    const doc = await reader.read(repoRoot);
    expect(doc.entries).toHaveLength(2);
    expect(doc.entries[0]).toMatchObject({
      pathGlob: 'src/api/**',
      ownerId: 'owner-api',
      teamId: 'team-platform',
      businessUnitId: 'bu-engineering',
      source: 'yaml',
    });
    expect(doc.entries[1]).toMatchObject({
      pathGlob: 'src/web/**',
      ownerId: 'owner-web',
      source: 'yaml',
    });
    expect(doc.entries[1]?.teamId).toBeUndefined();
  });

  it('returns an empty document when .shep/ownership.yaml is missing', async () => {
    const doc = await reader.read(repoRoot);
    expect(doc.entries).toEqual([]);
  });

  it('returns an empty document when the file is empty', async () => {
    mkdirSync(join(repoRoot, '.shep'), { recursive: true });
    writeFileSync(join(repoRoot, '.shep', 'ownership.yaml'), '');
    const doc = await reader.read(repoRoot);
    expect(doc.entries).toEqual([]);
  });

  it('skips entries missing required fields (pathGlob or ownerId)', async () => {
    mkdirSync(join(repoRoot, '.shep'), { recursive: true });
    writeFileSync(
      join(repoRoot, '.shep', 'ownership.yaml'),
      [
        'entries:',
        '  - pathGlob: "src/api/**"',
        '    ownerId: "owner-api"',
        '  - pathGlob: "src/no-owner/**"', // missing ownerId
        '  - ownerId: "no-path"', // missing pathGlob
      ].join('\n')
    );

    const doc = await reader.read(repoRoot);
    expect(doc.entries).toHaveLength(1);
    expect(doc.entries[0]!.pathGlob).toBe('src/api/**');
  });

  it('returns an empty document when the YAML is malformed', async () => {
    mkdirSync(join(repoRoot, '.shep'), { recursive: true });
    writeFileSync(join(repoRoot, '.shep', 'ownership.yaml'), 'not: [valid yaml');
    const doc = await reader.read(repoRoot);
    expect(doc.entries).toEqual([]);
  });

  it('returns an empty document when the file has no entries array', async () => {
    mkdirSync(join(repoRoot, '.shep'), { recursive: true });
    writeFileSync(join(repoRoot, '.shep', 'ownership.yaml'), 'other: 1\n');
    const doc = await reader.read(repoRoot);
    expect(doc.entries).toEqual([]);
  });
});
