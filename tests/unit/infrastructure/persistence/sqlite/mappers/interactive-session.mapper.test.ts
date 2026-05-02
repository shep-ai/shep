import { describe, it, expect } from 'vitest';
import {
  toDatabase,
  fromDatabase,
  type InteractiveSessionRow,
} from '@/infrastructure/persistence/sqlite/mappers/interactive-session.mapper.js';
import { InteractiveSessionStatus, type InteractiveSession } from '@/domain/generated/output.js';

const NOW = new Date('2026-03-22T10:00:00Z');
const LATER = new Date('2026-03-22T10:05:00Z');
const STOPPED = new Date('2026-03-22T10:15:00Z');

function createTestSession(overrides: Partial<InteractiveSession> = {}): InteractiveSession {
  return {
    id: 'session-001',
    featureId: 'feature-abc',
    status: InteractiveSessionStatus.ready,
    startedAt: NOW,
    lastActivityAt: LATER,
    createdAt: NOW,
    updatedAt: LATER,
    ...overrides,
  };
}

function createTestRow(overrides: Partial<InteractiveSessionRow> = {}): InteractiveSessionRow {
  return {
    id: 'session-001',
    feature_id: 'feature-abc',
    status: 'ready',
    started_at: NOW.getTime(),
    stopped_at: null,
    agent_session_id: null,
    turn_status: 'idle',
    last_activity_at: LATER.getTime(),
    created_at: NOW.getTime(),
    updated_at: LATER.getTime(),
    total_cost_usd: 0,
    total_input_tokens: 0,
    total_output_tokens: 0,
    total_turns: 0,
    ...overrides,
  };
}

describe('InteractiveSession Mapper — toDatabase()', () => {
  it('converts camelCase domain object to snake_case DB row', () => {
    const session = createTestSession();
    const row = toDatabase(session);
    expect(row.id).toBe('session-001');
    expect(row.feature_id).toBe('feature-abc');
    expect(row.status).toBe('ready');
    expect(row.started_at).toBe(NOW.getTime());
    expect(row.agent_session_id).toBeNull();
    expect(row.last_activity_at).toBe(LATER.getTime());
    expect(row.created_at).toBe(NOW.getTime());
    expect(row.updated_at).toBe(LATER.getTime());
  });

  it('maps undefined stoppedAt to null', () => {
    const session = createTestSession();
    const row = toDatabase(session);
    expect(row.stopped_at).toBeNull();
  });

  it('maps stoppedAt Date to unix milliseconds', () => {
    const session = createTestSession({ stoppedAt: STOPPED });
    const row = toDatabase(session);
    expect(row.stopped_at).toBe(STOPPED.getTime());
  });

  it('handles all InteractiveSessionStatus enum values', () => {
    const statuses: InteractiveSessionStatus[] = [
      InteractiveSessionStatus.booting,
      InteractiveSessionStatus.ready,
      InteractiveSessionStatus.stopped,
      InteractiveSessionStatus.error,
    ];
    for (const status of statuses) {
      const row = toDatabase(createTestSession({ status }));
      expect(row.status).toBe(status);
    }
  });
});

describe('InteractiveSession Mapper — fromDatabase()', () => {
  it('converts snake_case DB row to camelCase domain object', () => {
    const row = createTestRow();
    const session = fromDatabase(row);
    expect(session.id).toBe('session-001');
    expect(session.featureId).toBe('feature-abc');
    expect(session.status).toBe(InteractiveSessionStatus.ready);
    expect(session.startedAt).toEqual(NOW);
    expect(session.lastActivityAt).toEqual(LATER);
    expect(session.createdAt).toEqual(NOW);
    expect(session.updatedAt).toEqual(LATER);
  });

  it('maps null stopped_at to undefined stoppedAt', () => {
    const row = createTestRow({ stopped_at: null });
    const session = fromDatabase(row);
    expect(session.stoppedAt).toBeUndefined();
  });

  it('maps non-null stopped_at to Date', () => {
    const row = createTestRow({ stopped_at: STOPPED.getTime() });
    const session = fromDatabase(row);
    expect(session.stoppedAt).toEqual(STOPPED);
  });

  it('roundtrips correctly: toDatabase then fromDatabase', () => {
    const original = createTestSession({ stoppedAt: STOPPED });
    const row = toDatabase(original);
    const restored = fromDatabase(row);
    expect(restored.id).toBe(original.id);
    expect(restored.featureId).toBe(original.featureId);
    expect(restored.status).toBe(original.status);
    expect(restored.startedAt).toEqual(original.startedAt);
    expect(restored.stoppedAt).toEqual(original.stoppedAt);
    expect(restored.lastActivityAt).toEqual(original.lastActivityAt);
  });
});
