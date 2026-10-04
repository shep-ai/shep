/**
 * Space repositories integration tests (spec 120).
 *
 * In-memory SQLite with every migration applied. Each round trip writes a
 * non-default value and then a second, different one, so both the INSERT and
 * the UPDATE column lists are exercised (LESSONS: the write path must carry
 * every column).
 */

import 'reflect-metadata';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type Database from 'better-sqlite3';
import { createInMemoryDatabase } from '../../../helpers/database.helper.js';
import { runSQLiteMigrations } from '@/infrastructure/persistence/sqlite/migrations.js';
import { SQLiteSpaceRepository } from '@/infrastructure/repositories/sqlite-space.repository.js';
import { SQLiteProductLineRepository } from '@/infrastructure/repositories/sqlite-product-line.repository.js';
import { SQLiteSpaceMembershipRepository } from '@/infrastructure/repositories/sqlite-space-membership.repository.js';
import { DEFAULT_SPACE_ID } from '@/domain/shared/space-resolution.js';
import { AgentType, SpaceRuleKind, type Space } from '@/domain/generated/output.js';

const T1 = new Date('2026-10-01T10:00:00Z');
const T2 = new Date('2026-10-02T11:00:00Z');

describe('space repositories', () => {
  let db: Database.Database;
  let spaces: SQLiteSpaceRepository;
  let lines: SQLiteProductLineRepository;
  let membership: SQLiteSpaceMembershipRepository;

  beforeEach(async () => {
    db = createInMemoryDatabase();
    await runSQLiteMigrations(db);
    spaces = new SQLiteSpaceRepository(db);
    lines = new SQLiteProductLineRepository(db);
    membership = new SQLiteSpaceMembershipRepository(db);
  });

  afterEach(() => {
    db.close();
  });

  describe('SQLiteSpaceRepository', () => {
    it('returns the seeded default space', async () => {
      const def = await spaces.getDefault();
      expect(def.id).toBe(DEFAULT_SPACE_ID);
      expect(def.isDefault).toBe(true);
    });

    it('round-trips every field through create and update', async () => {
      await spaces.create({
        id: 's-acme',
        name: 'Acme',
        slug: 'acme',
        description: 'Work',
        color: '#3456c4',
        isDefault: false,
        createdAt: T1,
        updatedAt: T1,
      });
      await spaces.update({
        id: 's-acme',
        name: 'Acme Corp',
        slug: 'acme-corp',
        description: 'Day job',
        color: '#0d8470',
        isDefault: false,
        createdAt: T1,
        updatedAt: T2,
      });

      expect(await spaces.findById('s-acme')).toEqual({
        id: 's-acme',
        name: 'Acme Corp',
        slug: 'acme-corp',
        description: 'Day job',
        color: '#0d8470',
        isDefault: false,
        createdAt: T1,
        updatedAt: T2,
      });
      expect((await spaces.findBySlug('acme-corp'))?.id).toBe('s-acme');
    });

    it('round-trips agent settings, then changes and clears them (spec 121)', async () => {
      const space: Space = {
        id: 'space-acme',
        name: 'Acme',
        slug: 'acme',
        isDefault: false,
        agentSettings: {
          claudeConfigDir: '/home/me/.claude-acme',
          ghConfigDir: '/home/me/.config/gh-acme',
          gitAuthorName: 'Me',
          gitAuthorEmail: 'me@acme.com',
          awsProfile: 'acme',
          useBedrock: true,
          allowedAgentTypes: [AgentType.ClaudeCode, AgentType.CodexCli],
        },
        createdAt: T1,
        updatedAt: T1,
      };
      await spaces.create(space);
      expect((await spaces.findById(space.id))?.agentSettings).toEqual(space.agentSettings);

      const changed = {
        ...space,
        agentSettings: {
          ghConfigDir: '/gh-2',
          useBedrock: false,
          allowedAgentTypes: [AgentType.Cursor],
        },
        updatedAt: T2,
      };
      await spaces.update(changed);
      expect((await spaces.findById(space.id))?.agentSettings).toEqual(changed.agentSettings);

      const { agentSettings: _cleared, ...withoutSettings } = changed;
      await spaces.update(withoutSettings);
      expect((await spaces.findById(space.id))?.agentSettings).toBeUndefined();
    });

    it('moves the default flag atomically', async () => {
      await spaces.create({
        id: 's-p',
        name: 'Personal',
        slug: 'personal',
        isDefault: false,
        createdAt: T1,
        updatedAt: T1,
      });
      await spaces.setDefault('s-p');

      const all = await spaces.list();
      expect(all.filter((s) => s.isDefault).map((s) => s.id)).toEqual(['s-p']);
      expect(all[0].id).toBe('s-p');
    });

    it('deletes a space', async () => {
      await spaces.create({
        id: 's-x',
        name: 'X',
        slug: 'x',
        isDefault: false,
        createdAt: T1,
        updatedAt: T1,
      });
      await spaces.delete('s-x');
      expect(await spaces.findById('s-x')).toBeNull();
    });
  });

  describe('SQLiteProductLineRepository', () => {
    it('round-trips through create and update and lists by space', async () => {
      await lines.create({
        id: 'l-pay',
        spaceId: DEFAULT_SPACE_ID,
        name: 'Payments',
        slug: 'payments',
        description: 'Money',
        createdAt: T1,
        updatedAt: T1,
      });
      await lines.update({
        id: 'l-pay',
        spaceId: DEFAULT_SPACE_ID,
        name: 'Payments platform',
        slug: 'payments-platform',
        description: 'All money movement',
        createdAt: T1,
        updatedAt: T2,
      });

      expect(await lines.findById('l-pay')).toEqual({
        id: 'l-pay',
        spaceId: DEFAULT_SPACE_ID,
        name: 'Payments platform',
        slug: 'payments-platform',
        description: 'All money movement',
        createdAt: T1,
        updatedAt: T2,
      });
      expect((await lines.findBySlug(DEFAULT_SPACE_ID, 'payments-platform'))?.id).toBe('l-pay');
      expect((await lines.listBySpace(DEFAULT_SPACE_ID)).map((l) => l.id)).toEqual(['l-pay']);
      expect(await lines.listBySpace('other')).toEqual([]);
    });

    it('deletes every line of a space', async () => {
      await lines.create({
        id: 'l1',
        spaceId: 's1',
        name: 'A',
        slug: 'a',
        createdAt: T1,
        updatedAt: T1,
      });
      await lines.create({
        id: 'l2',
        spaceId: 's2',
        name: 'B',
        slug: 'b',
        createdAt: T1,
        updatedAt: T1,
      });
      await lines.deleteBySpace('s1');
      expect((await lines.listAll()).map((l) => l.id)).toEqual(['l2']);
    });
  });

  describe('SQLiteSpaceMembershipRepository', () => {
    it('round-trips a rule with every field', async () => {
      await membership.createRule({
        id: 'r1',
        spaceId: 's-acme',
        productLineId: 'l-pay',
        kind: SpaceRuleKind.Remote,
        pattern: 'github.com/acme/*',
        priority: 7,
        createdAt: T1,
        updatedAt: T2,
      });
      expect(await membership.listRules()).toEqual([
        {
          id: 'r1',
          spaceId: 's-acme',
          productLineId: 'l-pay',
          kind: SpaceRuleKind.Remote,
          pattern: 'github.com/acme/*',
          priority: 7,
          createdAt: T1,
          updatedAt: T2,
        },
      ]);
      expect(await membership.findRuleById('r1')).not.toBeNull();
    });

    it('lists rules by space and deletes them', async () => {
      await membership.createRule({
        id: 'r1',
        spaceId: 's1',
        kind: SpaceRuleKind.Path,
        pattern: '/a',
        priority: 100,
        createdAt: T1,
        updatedAt: T1,
      });
      await membership.createRule({
        id: 'r2',
        spaceId: 's2',
        kind: SpaceRuleKind.Path,
        pattern: '/b',
        priority: 100,
        createdAt: T1,
        updatedAt: T1,
      });
      expect((await membership.listRules('s1')).map((r) => r.id)).toEqual(['r1']);
      await membership.deleteRule('r1');
      await membership.deleteRulesForSpace('s2');
      expect(await membership.listRules()).toEqual([]);
    });

    it('upserts an assignment by repository path', async () => {
      await membership.upsertAssignment({
        repositoryPath: '/code/acme/api',
        spaceId: 's1',
        productLineId: 'l1',
        createdAt: T1,
        updatedAt: T1,
      });
      await membership.upsertAssignment({
        repositoryPath: '/code/acme/api',
        spaceId: 's2',
        createdAt: T2,
        updatedAt: T2,
      });

      expect(await membership.findAssignment('/code/acme/api')).toEqual({
        repositoryPath: '/code/acme/api',
        spaceId: 's2',
        createdAt: T1,
        updatedAt: T2,
      });
      expect((await membership.listAssignments('s2')).length).toBe(1);
      expect(await membership.listAssignments('s1')).toEqual([]);
    });

    it('clears a deleted product line from rules and assignments', async () => {
      await membership.createRule({
        id: 'r1',
        spaceId: 's1',
        productLineId: 'l1',
        kind: SpaceRuleKind.Path,
        pattern: '/a',
        priority: 100,
        createdAt: T1,
        updatedAt: T1,
      });
      await membership.upsertAssignment({
        repositoryPath: '/a/b',
        spaceId: 's1',
        productLineId: 'l1',
        createdAt: T1,
        updatedAt: T1,
      });

      await membership.clearProductLine('l1');

      expect((await membership.findRuleById('r1'))?.productLineId).toBeUndefined();
      expect((await membership.findAssignment('/a/b'))?.productLineId).toBeUndefined();
    });

    it('deletes assignments one by one and per space', async () => {
      const a = { spaceId: 's1', createdAt: T1, updatedAt: T1 };
      await membership.upsertAssignment({ ...a, repositoryPath: '/x' });
      await membership.upsertAssignment({ ...a, repositoryPath: '/y' });
      await membership.deleteAssignment('/x');
      expect(await membership.findAssignment('/x')).toBeNull();
      await membership.deleteAssignmentsForSpace('s1');
      expect(await membership.listAssignments()).toEqual([]);
    });
  });
});
