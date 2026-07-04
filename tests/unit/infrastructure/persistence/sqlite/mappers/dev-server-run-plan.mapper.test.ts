/**
 * DevServerRunPlan Mapper Unit Tests
 *
 * Verifies both mapping directions between DevServerRunPlan domain objects
 * and dev_server_run_plans rows:
 * - camelCase <-> snake_case field mapping
 * - JSON round-trip of setup_commands (including empty arrays)
 * - null <-> undefined handling for every optional field
 * - ISO-8601 TEXT date handling with millisecond precision
 */

import { describe, it, expect } from 'vitest';
import type { DevServerRunPlan } from '@/domain/generated/output.js';
import { RunPlanSource } from '@/domain/generated/output.js';
import {
  toDatabase,
  fromDatabase,
  type DevServerRunPlanRow,
} from '@/infrastructure/persistence/sqlite/mappers/dev-server-run-plan.mapper.js';

const FULL_PLAN: DevServerRunPlan = {
  repoPath: '/home/user/mono',
  source: RunPlanSource.Agent,
  command: 'pnpm dev',
  cwd: '/home/user/mono/apps/web',
  packageManager: 'pnpm',
  expectedPort: 3000,
  language: 'TypeScript',
  framework: 'Next.js',
  setupCommands: ['corepack enable pnpm', 'pnpm exec playwright install'],
  configHash: 'cfg-hash-abc',
  installStampHash: 'stamp-hash-def',
  createdAt: new Date('2026-07-04T10:00:00.123Z'),
  updatedAt: new Date('2026-07-04T11:30:00.456Z'),
};

const MINIMAL_PLAN: DevServerRunPlan = {
  repoPath: '/home/user/minimal',
  source: RunPlanSource.Deterministic,
  command: 'npm run dev',
  cwd: '/home/user/minimal',
  setupCommands: [],
  configHash: 'cfg-hash-min',
  createdAt: new Date('2026-07-04T10:00:00.000Z'),
  updatedAt: new Date('2026-07-04T10:00:00.000Z'),
};

describe('dev-server-run-plan.mapper', () => {
  describe('toDatabase()', () => {
    it('maps every field of a fully-populated plan to snake_case columns', () => {
      const row = toDatabase(FULL_PLAN);

      expect(row.repo_path).toBe('/home/user/mono');
      expect(row.plan_source).toBe('Agent');
      expect(row.command).toBe('pnpm dev');
      expect(row.cwd).toBe('/home/user/mono/apps/web');
      expect(row.package_manager).toBe('pnpm');
      expect(row.expected_port).toBe(3000);
      expect(row.language).toBe('TypeScript');
      expect(row.framework).toBe('Next.js');
      expect(row.setup_commands).toBe(
        JSON.stringify(['corepack enable pnpm', 'pnpm exec playwright install'])
      );
      expect(row.config_hash).toBe('cfg-hash-abc');
      expect(row.install_stamp_hash).toBe('stamp-hash-def');
      expect(row.created_at).toBe('2026-07-04T10:00:00.123Z');
      expect(row.updated_at).toBe('2026-07-04T11:30:00.456Z');
    });

    it('maps undefined optional fields to null', () => {
      const row = toDatabase(MINIMAL_PLAN);

      expect(row.package_manager).toBeNull();
      expect(row.expected_port).toBeNull();
      expect(row.language).toBeNull();
      expect(row.framework).toBeNull();
      expect(row.install_stamp_hash).toBeNull();
    });

    it('serializes an empty setupCommands array as "[]"', () => {
      expect(toDatabase(MINIMAL_PLAN).setup_commands).toBe('[]');
    });
  });

  describe('fromDatabase()', () => {
    const FULL_ROW: DevServerRunPlanRow = {
      repo_path: '/home/user/mono',
      plan_source: 'Agent',
      command: 'pnpm dev',
      cwd: '/home/user/mono/apps/web',
      package_manager: 'pnpm',
      expected_port: 3000,
      language: 'TypeScript',
      framework: 'Next.js',
      setup_commands: '["corepack enable pnpm","pnpm exec playwright install"]',
      config_hash: 'cfg-hash-abc',
      install_stamp_hash: 'stamp-hash-def',
      created_at: '2026-07-04T10:00:00.123Z',
      updated_at: '2026-07-04T11:30:00.456Z',
    };

    it('maps every column of a fully-populated row to camelCase fields', () => {
      const plan = fromDatabase(FULL_ROW);

      expect(plan.repoPath).toBe('/home/user/mono');
      expect(plan.source).toBe(RunPlanSource.Agent);
      expect(plan.command).toBe('pnpm dev');
      expect(plan.cwd).toBe('/home/user/mono/apps/web');
      expect(plan.packageManager).toBe('pnpm');
      expect(plan.expectedPort).toBe(3000);
      expect(plan.language).toBe('TypeScript');
      expect(plan.framework).toBe('Next.js');
      expect(plan.setupCommands).toEqual(['corepack enable pnpm', 'pnpm exec playwright install']);
      expect(plan.configHash).toBe('cfg-hash-abc');
      expect(plan.installStampHash).toBe('stamp-hash-def');
      expect(plan.createdAt).toEqual(new Date('2026-07-04T10:00:00.123Z'));
      expect(plan.updatedAt).toEqual(new Date('2026-07-04T11:30:00.456Z'));
    });

    it('maps null optional columns to undefined', () => {
      const plan = fromDatabase({
        ...FULL_ROW,
        package_manager: null,
        expected_port: null,
        language: null,
        framework: null,
        install_stamp_hash: null,
      });

      expect(plan.packageManager).toBeUndefined();
      expect(plan.expectedPort).toBeUndefined();
      expect(plan.language).toBeUndefined();
      expect(plan.framework).toBeUndefined();
      expect(plan.installStampHash).toBeUndefined();
    });

    it('parses an empty setup_commands JSON array', () => {
      const plan = fromDatabase({ ...FULL_ROW, setup_commands: '[]' });
      expect(plan.setupCommands).toEqual([]);
    });
  });

  describe('round-trip', () => {
    it('preserves a fully-populated plan through toDatabase -> fromDatabase', () => {
      expect(fromDatabase(toDatabase(FULL_PLAN))).toEqual(FULL_PLAN);
    });

    it('preserves a minimal plan (no optionals, empty setupCommands) through a round-trip', () => {
      const roundTripped = fromDatabase(toDatabase(MINIMAL_PLAN));
      expect(roundTripped).toEqual(MINIMAL_PLAN);
      expect(roundTripped.source).toBe(RunPlanSource.Deterministic);
    });

    it('preserves setup commands containing JSON-hostile characters', () => {
      const tricky: DevServerRunPlan = {
        ...FULL_PLAN,
        setupCommands: ['echo "quoted"', "awk '{print $1}'", 'a\\b\nnewline'],
      };
      expect(fromDatabase(toDatabase(tricky)).setupCommands).toEqual(tricky.setupCommands);
    });
  });
});
