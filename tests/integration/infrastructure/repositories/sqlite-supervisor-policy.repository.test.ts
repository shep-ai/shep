/**
 * SQLiteSupervisorPolicyRepository — integration tests (spec 093).
 */

import 'reflect-metadata';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type Database from 'better-sqlite3';
import { createInMemoryDatabase } from '../../../helpers/database.helper.js';
import { runSQLiteMigrations } from '@/infrastructure/persistence/sqlite/migrations.js';
import { SQLiteSupervisorPolicyRepository } from '@/infrastructure/repositories/sqlite-supervisor-policy.repository.js';
import type { SupervisorPolicy } from '@/domain/generated/output.js';
import { SupervisorAutonomy, SupervisorScopeType } from '@/domain/generated/output.js';

function makePolicy(overrides: Partial<SupervisorPolicy> = {}): SupervisorPolicy {
  const now = new Date();
  return {
    id: overrides.id ?? `pol-${Math.random().toString(36).slice(2, 9)}`,
    scopeType: SupervisorScopeType.app,
    scopeId: 'app-1',
    featureId: undefined,
    enabled: true,
    autonomyLevel: SupervisorAutonomy.advisory,
    gateAuthorityJson: undefined,
    modelId: undefined,
    promptVersion: undefined,
    policyRulesJson: undefined,
    guardrailRulesJson: undefined,
    notificationOverridesJson: undefined,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  } as SupervisorPolicy;
}

describe('SQLiteSupervisorPolicyRepository', () => {
  let db: Database.Database;
  let repo: SQLiteSupervisorPolicyRepository;

  beforeEach(async () => {
    db = createInMemoryDatabase();
    await runSQLiteMigrations(db);
    repo = new SQLiteSupervisorPolicyRepository(db);
  });

  afterEach(() => {
    db.close();
  });

  it('create + findById round-trips a policy', async () => {
    await repo.create(
      makePolicy({
        id: 'p1',
        gateAuthorityJson: '{"prd":"advisory"}',
        policyRulesJson: '[]',
      })
    );
    const found = await repo.findById('p1');
    expect(found?.id).toBe('p1');
    expect(found?.gateAuthorityJson).toBe('{"prd":"advisory"}');
    expect(found?.policyRulesJson).toBe('[]');
  });

  it('rejects duplicate (scope_type, scope_id, NULL feature_id)', async () => {
    await repo.create(
      makePolicy({
        id: 'p1',
        scopeType: SupervisorScopeType.app,
        scopeId: 'app-1',
        featureId: undefined,
      })
    );
    await expect(
      repo.create(
        makePolicy({
          id: 'p2',
          scopeType: SupervisorScopeType.app,
          scopeId: 'app-1',
          featureId: undefined,
        })
      )
    ).rejects.toThrow();
  });

  it('rejects duplicate (scope_type, scope_id, feature_id)', async () => {
    await repo.create(
      makePolicy({
        id: 'p1',
        scopeType: SupervisorScopeType.app,
        scopeId: 'app-1',
        featureId: 'f1',
      })
    );
    await expect(
      repo.create(
        makePolicy({
          id: 'p2',
          scopeType: SupervisorScopeType.app,
          scopeId: 'app-1',
          featureId: 'f1',
        })
      )
    ).rejects.toThrow();
  });

  it('findPolicyForScope returns the feature override when present', async () => {
    await repo.create(
      makePolicy({
        id: 'app-pol',
        scopeType: SupervisorScopeType.app,
        scopeId: 'app-1',
        featureId: undefined,
      })
    );
    await repo.create(
      makePolicy({
        id: 'feat-pol',
        scopeType: SupervisorScopeType.app,
        scopeId: 'app-1',
        featureId: 'f1',
      })
    );
    const found = await repo.findPolicyForScope('app', 'app-1', 'f1');
    expect(found?.id).toBe('feat-pol');
  });

  it('findPolicyForScope falls back to the scope row when no feature override exists', async () => {
    await repo.create(
      makePolicy({
        id: 'app-pol',
        scopeType: SupervisorScopeType.app,
        scopeId: 'app-1',
        featureId: undefined,
      })
    );
    const found = await repo.findPolicyForScope('app', 'app-1', 'f-missing');
    expect(found?.id).toBe('app-pol');
  });

  it('findPolicyForScope returns null when neither row exists', async () => {
    const found = await repo.findPolicyForScope('app', 'missing', 'feat');
    expect(found).toBeNull();
  });

  it('update persists changes', async () => {
    await repo.create(makePolicy({ id: 'p1', enabled: false }));
    const fetched = await repo.findById('p1');
    if (!fetched) throw new Error('precondition failed');
    await repo.update({ ...fetched, enabled: true, updatedAt: new Date() });
    const after = await repo.findById('p1');
    expect(after?.enabled).toBe(true);
  });

  it('delete removes the policy', async () => {
    await repo.create(makePolicy({ id: 'p1' }));
    await repo.delete('p1');
    expect(await repo.findById('p1')).toBeNull();
  });

  it('listByScope returns only that scope, with the scope-level row first', async () => {
    await repo.create(
      makePolicy({
        id: 'app-pol',
        scopeType: SupervisorScopeType.app,
        scopeId: 'app-1',
        featureId: undefined,
      })
    );
    await repo.create(
      makePolicy({
        id: 'feat-pol',
        scopeType: SupervisorScopeType.app,
        scopeId: 'app-1',
        featureId: 'f1',
      })
    );
    await repo.create(
      makePolicy({ id: 'cross', scopeType: SupervisorScopeType.app, scopeId: 'app-2' })
    );

    const list = await repo.listByScope('app', 'app-1');
    expect(list.map((p: SupervisorPolicy) => p.id)).toEqual(['app-pol', 'feat-pol']);
  });

  // Spec 111: migration 144 adds guardrail_rules_json. The column is nullable
  // and NULL means "no guardrails configured", so a policy written before the
  // migration keeps the pre-111 behaviour.
  it('round-trips guardrailRulesJson through create and read', async () => {
    const rules = JSON.stringify([
      { id: 'rule-low-risk', gate: 'merge', maxDiffLines: 250, autoApprove: true },
    ]);
    await repo.create(makePolicy({ id: 'with-rules', guardrailRulesJson: rules }));

    const found = await repo.findById('with-rules');
    expect(found?.guardrailRulesJson).toBe(rules);
  });

  it('round-trips guardrailRulesJson through update', async () => {
    await repo.create(makePolicy({ id: 'upd' }));
    const before = await repo.findById('upd');
    expect(before?.guardrailRulesJson).toBeUndefined();

    const rules = JSON.stringify([{ id: 'r', gate: 'all', autoApprove: false }]);
    await repo.update({ ...before!, guardrailRulesJson: rules });

    const after = await repo.findById('upd');
    expect(after?.guardrailRulesJson).toBe(rules);

    // Clearing the rules must persist as NULL, not as the previous value.
    await repo.update({ ...after!, guardrailRulesJson: undefined });
    expect((await repo.findById('upd'))?.guardrailRulesJson).toBeUndefined();
  });

  it('leaves guardrailRulesJson undefined for policies created without rules', async () => {
    await repo.create(makePolicy({ id: 'plain' }));
    expect((await repo.findById('plain'))?.guardrailRulesJson).toBeUndefined();
  });
});
