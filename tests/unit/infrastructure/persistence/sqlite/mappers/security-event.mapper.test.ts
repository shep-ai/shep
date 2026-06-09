/**
 * Security Event Mapper Unit Tests
 *
 * Tests for the toDatabase/fromDatabase mapper functions.
 * Verifies correct column mapping, type conversions, and round-trip fidelity.
 */

import { describe, it, expect } from 'vitest';
import {
  toDatabase,
  fromDatabase,
  type SecurityEventRow,
} from '../../../../../../packages/core/src/infrastructure/persistence/sqlite/mappers/security-event.mapper.js';
import {
  SecuritySeverity,
  SecurityActionCategory,
  SecurityActionDisposition,
} from '../../../../../../packages/core/src/domain/generated/output.js';
import type { SecurityEvent } from '../../../../../../packages/core/src/domain/generated/output.js';

function createTestEvent(overrides: Partial<SecurityEvent> = {}): SecurityEvent {
  return {
    id: 'evt-001',
    repositoryPath: '/repos/my-project',
    severity: SecuritySeverity.High,
    category: SecurityActionCategory.DependencyInstall,
    disposition: SecurityActionDisposition.Denied,
    createdAt: new Date('2025-06-15T10:00:00Z'),
    updatedAt: new Date('2025-06-15T10:00:00Z'),
    featureId: 'feat-123',
    actor: 'agent',
    message: 'Blocked dependency install',
    remediationSummary: 'Remove disallowed package from dependencies',
    ...overrides,
  };
}

function createTestRow(overrides: Partial<SecurityEventRow> = {}): SecurityEventRow {
  return {
    id: 'evt-001',
    repository_path: '/repos/my-project',
    severity: 'High',
    category: 'DependencyInstall',
    disposition: 'Denied',
    created_at: '2025-06-15T10:00:00.000Z',
    feature_id: 'feat-123',
    actor: 'agent',
    message: 'Blocked dependency install',
    remediation_summary: 'Remove disallowed package from dependencies',
    ...overrides,
  };
}

describe('SecurityEvent Mapper', () => {
  describe('toDatabase()', () => {
    it('should map id correctly', () => {
      const event = createTestEvent();
      const row = toDatabase(event);
      expect(row.id).toBe('evt-001');
    });

    it('should map repositoryPath to repository_path', () => {
      const event = createTestEvent();
      const row = toDatabase(event);
      expect(row.repository_path).toBe('/repos/my-project');
    });

    it('should map featureId to feature_id', () => {
      const event = createTestEvent();
      const row = toDatabase(event);
      expect(row.feature_id).toBe('feat-123');
    });

    it('should map featureId to null when absent', () => {
      const event = createTestEvent({ featureId: undefined });
      const row = toDatabase(event);
      expect(row.feature_id).toBeNull();
    });

    it('should map enums as string values', () => {
      const event = createTestEvent();
      const row = toDatabase(event);
      expect(row.severity).toBe('High');
      expect(row.category).toBe('DependencyInstall');
      expect(row.disposition).toBe('Denied');
    });

    it('should map Date to ISO string', () => {
      const event = createTestEvent();
      const row = toDatabase(event);
      expect(row.created_at).toBe('2025-06-15T10:00:00.000Z');
    });

    it('should map optional fields to null when absent', () => {
      const event = createTestEvent({
        actor: undefined,
        message: undefined,
        remediationSummary: undefined,
      });
      const row = toDatabase(event);
      expect(row.actor).toBeNull();
      expect(row.message).toBeNull();
      expect(row.remediation_summary).toBeNull();
    });
  });

  describe('fromDatabase()', () => {
    it('should reconstruct id', () => {
      const row = createTestRow();
      const event = fromDatabase(row);
      expect(event.id).toBe('evt-001');
    });

    it('should reconstruct repositoryPath from repository_path', () => {
      const row = createTestRow();
      const event = fromDatabase(row);
      expect(event.repositoryPath).toBe('/repos/my-project');
    });

    it('should type-cast severity enum', () => {
      const row = createTestRow();
      const event = fromDatabase(row);
      expect(event.severity).toBe(SecuritySeverity.High);
    });

    it('should convert created_at ISO string to Date', () => {
      const row = createTestRow();
      const event = fromDatabase(row);
      expect(event.createdAt).toBeInstanceOf(Date);
      expect((event.createdAt as Date).toISOString()).toBe('2025-06-15T10:00:00.000Z');
    });

    it('should exclude optional fields when null', () => {
      const row = createTestRow({
        feature_id: null,
        actor: null,
        message: null,
        remediation_summary: null,
      });
      const event = fromDatabase(row);
      expect(event.featureId).toBeUndefined();
      expect(event.actor).toBeUndefined();
      expect(event.message).toBeUndefined();
      expect(event.remediationSummary).toBeUndefined();
    });

    it('should include optional fields when present', () => {
      const row = createTestRow();
      const event = fromDatabase(row);
      expect(event.featureId).toBe('feat-123');
      expect(event.actor).toBe('agent');
      expect(event.message).toBe('Blocked dependency install');
      expect(event.remediationSummary).toBe('Remove disallowed package from dependencies');
    });
  });

  describe('round-trip', () => {
    it('should preserve all values through toDatabase -> fromDatabase', () => {
      const original = createTestEvent();
      const row = toDatabase(original);
      const restored = fromDatabase(row);

      expect(restored.id).toBe(original.id);
      expect(restored.repositoryPath).toBe(original.repositoryPath);
      expect(restored.featureId).toBe(original.featureId);
      expect(restored.severity).toBe(original.severity);
      expect(restored.category).toBe(original.category);
      expect(restored.disposition).toBe(original.disposition);
      expect(restored.actor).toBe(original.actor);
      expect(restored.message).toBe(original.message);
      expect(restored.remediationSummary).toBe(original.remediationSummary);
    });

    it('should preserve values when optional fields are absent', () => {
      const original = createTestEvent({
        featureId: undefined,
        actor: undefined,
        message: undefined,
        remediationSummary: undefined,
      });
      const row = toDatabase(original);
      const restored = fromDatabase(row);

      expect(restored.featureId).toBeUndefined();
      expect(restored.actor).toBeUndefined();
      expect(restored.message).toBeUndefined();
      expect(restored.remediationSummary).toBeUndefined();
    });
  });
});
