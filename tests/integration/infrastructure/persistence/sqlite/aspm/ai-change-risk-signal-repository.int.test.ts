/**
 * SQLiteAiChangeRiskSignalRepository round-trip integration tests.
 *
 * Feature 098, phase 8 (task-49). Asserts the full state machine:
 *   - Persist new Open signal, list returns it.
 *   - Open → Acknowledged (updateState), still in countOpen.
 *   - Acknowledged → GraduatedToFinding (markGraduated): writes back-link
 *     and resolvedAt, drops from countOpen, unique constraint enforced on
 *     graduated_finding_id.
 *   - markDismissed transitions and stamps resolvedAt.
 *   - softDelete excludes from queries while preserving row.
 */

import 'reflect-metadata';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';

import { createInMemoryDatabase } from '../../../../../helpers/database.helper.js';
import { runSQLiteMigrations } from '@/infrastructure/persistence/sqlite/migrations.js';
import { SQLiteAiChangeRiskSignalRepository } from '@/infrastructure/repositories/aspm/sqlite-ai-change-risk-signal-repository.js';
import {
  AiSignalState,
  AiSignalType,
  CanonicalSeverity,
  type AiChangeRiskSignal,
} from '@/domain/generated/output.js';

function makeSignal(overrides: Partial<AiChangeRiskSignal> = {}): AiChangeRiskSignal {
  const now = new Date('2026-05-19T12:00:00.000Z');
  return {
    id: randomUUID(),
    applicationId: randomUUID(),
    agentSessionId: 'session-abc',
    signalType: AiSignalType.SecretInDiff,
    severity: CanonicalSeverity.High,
    summary: 'AI-generated diff contained an AWS access key',
    evidence: JSON.stringify({ path: 'src/config.ts', line: 12 }),
    state: AiSignalState.Open,
    discoveredAt: now,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe('SQLiteAiChangeRiskSignalRepository', () => {
  let db: Database.Database;
  let repo: SQLiteAiChangeRiskSignalRepository;

  beforeEach(async () => {
    db = createInMemoryDatabase();
    await runSQLiteMigrations(db);
    repo = new SQLiteAiChangeRiskSignalRepository(db);
  });

  afterEach(() => {
    db.close();
  });

  it('persists a new Open signal and reads it back', async () => {
    const s = makeSignal();
    await repo.create(s);

    const read = await repo.findById(s.id);
    expect(read).not.toBeNull();
    expect(read!.id).toBe(s.id);
    expect(read!.applicationId).toBe(s.applicationId);
    expect(read!.signalType).toBe(AiSignalType.SecretInDiff);
    expect(read!.severity).toBe(CanonicalSeverity.High);
    expect(read!.state).toBe(AiSignalState.Open);
    expect(read!.evidence).toBe(s.evidence);
    expect(read!.resolvedAt).toBeUndefined();
  });

  it('countOpen counts Open + Acknowledged but ignores terminal states and deleted rows', async () => {
    const open = makeSignal({ state: AiSignalState.Open });
    const ack = makeSignal({ state: AiSignalState.Acknowledged });
    const dismissed = makeSignal({ state: AiSignalState.Dismissed });
    const graduated = makeSignal({ state: AiSignalState.GraduatedToFinding });
    const resolved = makeSignal({ state: AiSignalState.Resolved });

    await repo.create(open);
    await repo.create(ack);
    await repo.create(dismissed);
    await repo.create(graduated);
    await repo.create(resolved);

    expect(await repo.countOpen()).toBe(2);

    await repo.softDelete(open.id);
    expect(await repo.countOpen()).toBe(1);
  });

  it('list defaults to Open + Acknowledged ordered newest-first', async () => {
    const older = makeSignal({
      discoveredAt: new Date('2026-05-01T00:00:00Z'),
      state: AiSignalState.Open,
    });
    const newer = makeSignal({
      discoveredAt: new Date('2026-05-10T00:00:00Z'),
      state: AiSignalState.Acknowledged,
    });
    const terminal = makeSignal({ state: AiSignalState.Dismissed });

    await repo.create(older);
    await repo.create(newer);
    await repo.create(terminal);

    const rows = await repo.list();
    expect(rows.map((r) => r.id)).toEqual([newer.id, older.id]);
  });

  it('list filters by applicationId and signalType', async () => {
    const appA = randomUUID();
    const appB = randomUUID();
    const aSecret = makeSignal({ applicationId: appA, signalType: AiSignalType.SecretInDiff });
    const aDep = makeSignal({
      applicationId: appA,
      signalType: AiSignalType.HighRiskDependencyAdded,
    });
    const bSecret = makeSignal({ applicationId: appB, signalType: AiSignalType.SecretInDiff });
    await repo.create(aSecret);
    await repo.create(aDep);
    await repo.create(bSecret);

    const onlyA = await repo.list({ applicationId: appA });
    expect(new Set(onlyA.map((r) => r.id))).toEqual(new Set([aSecret.id, aDep.id]));

    const onlySecrets = await repo.list({ signalTypes: [AiSignalType.SecretInDiff] });
    expect(new Set(onlySecrets.map((r) => r.id))).toEqual(new Set([aSecret.id, bSecret.id]));
  });

  it('updateState moves Open → Acknowledged without stamping resolvedAt', async () => {
    const s = makeSignal();
    await repo.create(s);
    const at = new Date('2026-05-20T10:00:00Z');
    await repo.updateState(s.id, AiSignalState.Acknowledged, at);

    const read = await repo.findById(s.id);
    expect(read!.state).toBe(AiSignalState.Acknowledged);
    expect(read!.resolvedAt).toBeUndefined();
    expect(read!.updatedAt.getTime()).toBe(at.getTime());
  });

  it('updateState stamps resolvedAt when transitioning into a terminal state', async () => {
    const s = makeSignal();
    await repo.create(s);
    const at = new Date('2026-05-20T10:00:00Z');
    await repo.updateState(s.id, AiSignalState.Resolved, at);

    const read = await repo.findById(s.id);
    expect(read!.state).toBe(AiSignalState.Resolved);
    expect(read!.resolvedAt?.getTime()).toBe(at.getTime());
  });

  it('markGraduated sets state + back-link + resolvedAt atomically', async () => {
    const s = makeSignal();
    await repo.create(s);
    const findingId = randomUUID();
    const at = new Date('2026-05-20T10:00:00Z');
    await repo.markGraduated(s.id, findingId, at);

    const read = await repo.findById(s.id);
    expect(read!.state).toBe(AiSignalState.GraduatedToFinding);
    expect(read!.graduatedFindingId).toBe(findingId);
    expect(read!.resolvedAt?.getTime()).toBe(at.getTime());
  });

  it('rejects a second signal graduating into the same finding via unique index', async () => {
    const findingId = randomUUID();
    const a = makeSignal();
    const b = makeSignal();
    await repo.create(a);
    await repo.create(b);
    await repo.markGraduated(a.id, findingId, new Date());

    await expect(repo.markGraduated(b.id, findingId, new Date())).rejects.toThrow();
  });

  it('markDismissed transitions to Dismissed, persists evidence, stamps resolvedAt', async () => {
    const s = makeSignal();
    await repo.create(s);
    const at = new Date('2026-05-20T10:00:00Z');
    const updatedEvidence = JSON.stringify({
      original: { path: 'src/config.ts', line: 12 },
      dismissals: [{ at: at.toISOString(), actor: 'alice', justification: 'test key only' }],
    });
    await repo.markDismissed(s.id, updatedEvidence, at);

    const read = await repo.findById(s.id);
    expect(read!.state).toBe(AiSignalState.Dismissed);
    expect(read!.resolvedAt?.getTime()).toBe(at.getTime());
    expect(read!.evidence).toBe(updatedEvidence);
  });

  it('softDelete excludes the signal from queries while preserving the row', async () => {
    const s = makeSignal();
    await repo.create(s);
    await repo.softDelete(s.id);

    expect(await repo.findById(s.id)).toBeNull();
    expect(await repo.list()).toEqual([]);
    expect(await repo.countOpen()).toBe(0);
  });

  it('throws when transitioning a non-existent signal', async () => {
    const missing = randomUUID();
    await expect(repo.markGraduated(missing, randomUUID(), new Date())).rejects.toThrow();
    await expect(repo.markDismissed(missing, '{}', new Date())).rejects.toThrow();
    await expect(
      repo.updateState(missing, AiSignalState.Acknowledged, new Date())
    ).rejects.toThrow();
  });
});
