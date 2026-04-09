import { describe, it, expect } from 'vitest';
import {
  toDatabase,
  fromDatabase,
  type InteractiveMessageRow,
} from '@/infrastructure/persistence/sqlite/mappers/interactive-message.mapper.js';
import { InteractiveMessageRole, type InteractiveMessage } from '@/domain/generated/output.js';

const NOW = new Date('2026-03-22T10:05:00Z');

function createTestMessage(overrides: Partial<InteractiveMessage> = {}): InteractiveMessage {
  return {
    id: 'msg-001',
    featureId: 'feature-abc',
    sessionId: 'session-001',
    role: InteractiveMessageRole.user,
    content: 'What is the current implementation status?',
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function createTestRow(overrides: Partial<InteractiveMessageRow> = {}): InteractiveMessageRow {
  return {
    id: 'msg-001',
    feature_id: 'feature-abc',
    session_id: 'session-001',
    role: 'user',
    content: 'What is the current implementation status?',
    step_id: null,
    created_at: NOW.getTime(),
    updated_at: NOW.getTime(),
    ...overrides,
  };
}

describe('InteractiveMessage Mapper — toDatabase()', () => {
  it('converts camelCase domain object to snake_case DB row', () => {
    const message = createTestMessage();
    const row = toDatabase(message);
    expect(row.id).toBe('msg-001');
    expect(row.feature_id).toBe('feature-abc');
    expect(row.session_id).toBe('session-001');
    expect(row.role).toBe('user');
    expect(row.content).toBe('What is the current implementation status?');
    expect(row.created_at).toBe(NOW.getTime());
    expect(row.updated_at).toBe(NOW.getTime());
  });

  it('maps undefined sessionId to null', () => {
    const message = createTestMessage({ sessionId: undefined });
    const row = toDatabase(message);
    expect(row.session_id).toBeNull();
  });

  it('maps assistant role correctly', () => {
    const message = createTestMessage({ role: InteractiveMessageRole.assistant });
    const row = toDatabase(message);
    expect(row.role).toBe('assistant');
  });
});

describe('InteractiveMessage Mapper — fromDatabase()', () => {
  it('converts snake_case DB row to camelCase domain object', () => {
    const row = createTestRow();
    const message = fromDatabase(row);
    expect(message.id).toBe('msg-001');
    expect(message.featureId).toBe('feature-abc');
    expect(message.sessionId).toBe('session-001');
    expect(message.role).toBe(InteractiveMessageRole.user);
    expect(message.content).toBe('What is the current implementation status?');
    expect(message.createdAt).toEqual(NOW);
    expect(message.updatedAt).toEqual(NOW);
  });

  it('maps null session_id to undefined sessionId', () => {
    const row = createTestRow({ session_id: null });
    const message = fromDatabase(row);
    expect(message.sessionId).toBeUndefined();
  });

  it('maps assistant role correctly', () => {
    const row = createTestRow({ role: 'assistant' });
    const message = fromDatabase(row);
    expect(message.role).toBe(InteractiveMessageRole.assistant);
  });

  it('roundtrips correctly: toDatabase then fromDatabase', () => {
    const original = createTestMessage();
    const row = toDatabase(original);
    const restored = fromDatabase(row);
    expect(restored.id).toBe(original.id);
    expect(restored.featureId).toBe(original.featureId);
    expect(restored.sessionId).toBe(original.sessionId);
    expect(restored.role).toBe(original.role);
    expect(restored.content).toBe(original.content);
    expect(restored.createdAt).toEqual(original.createdAt);
    expect(restored.updatedAt).toEqual(original.updatedAt);
  });
});
