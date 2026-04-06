import { describe, it, expect } from 'vitest';
import {
  toDatabase,
  fromDatabase,
  type RepositoryRow,
} from '@/infrastructure/persistence/sqlite/mappers/repository.mapper.js';
import type { Repository } from '@/domain/generated/output.js';

function createTestRepository(overrides: Partial<Repository> = {}): Repository {
  return {
    id: 'repo-abc-123',
    name: 'my-project',
    path: '/Users/test/my-project',
    createdAt: new Date('2025-06-01T10:00:00Z'),
    updatedAt: new Date('2025-06-01T12:00:00Z'),
    ...overrides,
  };
}

function createTestRow(overrides: Partial<RepositoryRow> = {}): RepositoryRow {
  return {
    id: 'repo-abc-123',
    name: 'my-project',
    path: '/Users/test/my-project',
    remote_url: null,
    is_fork: 0,
    upstream_url: null,
    created_at: new Date('2025-06-01T10:00:00Z').getTime(),
    updated_at: new Date('2025-06-01T12:00:00Z').getTime(),
    deleted_at: null,
    ...overrides,
  };
}

describe('Repository Mapper', () => {
  describe('toDatabase', () => {
    it('should map all fields to snake_case columns', () => {
      const repo = createTestRepository();
      const row = toDatabase(repo);

      expect(row.id).toBe('repo-abc-123');
      expect(row.name).toBe('my-project');
      expect(row.path).toBe('/Users/test/my-project');
      expect(row.created_at).toBe(new Date('2025-06-01T10:00:00Z').getTime());
      expect(row.updated_at).toBe(new Date('2025-06-01T12:00:00Z').getTime());
    });

    it('should convert Date objects to unix milliseconds', () => {
      const date = new Date('2025-01-15T08:30:00Z');
      const repo = createTestRepository({ createdAt: date });
      const row = toDatabase(repo);

      expect(row.created_at).toBe(date.getTime());
    });
  });

  describe('fromDatabase', () => {
    it('should map all columns to camelCase fields', () => {
      const row = createTestRow();
      const repo = fromDatabase(row);

      expect(repo.id).toBe('repo-abc-123');
      expect(repo.name).toBe('my-project');
      expect(repo.path).toBe('/Users/test/my-project');
      expect(repo.createdAt).toBeInstanceOf(Date);
      expect(repo.updatedAt).toBeInstanceOf(Date);
    });

    it('should convert unix milliseconds back to Date objects', () => {
      const date = new Date('2025-01-15T08:30:00Z');
      const row = createTestRow({ created_at: date.getTime() });
      const repo = fromDatabase(row);

      expect(repo.createdAt).toEqual(date);
    });
  });

  describe('soft delete (deletedAt)', () => {
    it('toDatabase should map deletedAt Date to unix milliseconds', () => {
      const deletedAt = new Date('2025-06-02T09:00:00Z');
      const repo = createTestRepository({ deletedAt });
      const row = toDatabase(repo);

      expect(row.deleted_at).toBe(deletedAt.getTime());
    });

    it('toDatabase should map undefined deletedAt to null', () => {
      const repo = createTestRepository();
      const row = toDatabase(repo);

      expect(row.deleted_at).toBeNull();
    });

    it('fromDatabase should map deleted_at integer to Date', () => {
      const deletedAt = new Date('2025-06-02T09:00:00Z');
      const row = createTestRow({ deleted_at: deletedAt.getTime() });
      const repo = fromDatabase(row);

      expect(repo.deletedAt).toEqual(deletedAt);
    });

    it('fromDatabase should map null deleted_at to undefined', () => {
      const row = createTestRow({ deleted_at: null });
      const repo = fromDatabase(row);

      expect(repo.deletedAt).toBeUndefined();
    });
  });

  describe('remoteUrl mapping', () => {
    it('toDatabase should map remoteUrl to remote_url column', () => {
      const repo = createTestRepository({ remoteUrl: 'https://github.com/owner/repo' });
      const row = toDatabase(repo);

      expect(row.remote_url).toBe('https://github.com/owner/repo');
    });

    it('toDatabase should map undefined remoteUrl to null', () => {
      const repo = createTestRepository();
      const row = toDatabase(repo);

      expect(row.remote_url).toBeNull();
    });

    it('fromDatabase should map remote_url to remoteUrl', () => {
      const row = createTestRow({ remote_url: 'https://github.com/owner/repo' });
      const repo = fromDatabase(row);

      expect(repo.remoteUrl).toBe('https://github.com/owner/repo');
    });

    it('fromDatabase should map null remote_url to undefined', () => {
      const row = createTestRow({ remote_url: null });
      const repo = fromDatabase(row);

      expect(repo.remoteUrl).toBeUndefined();
    });
  });

  describe('round-trip', () => {
    it('should preserve all data through toDatabase -> fromDatabase', () => {
      const original = createTestRepository();
      const row = toDatabase(original);
      const restored = fromDatabase(row);

      expect(restored.id).toBe(original.id);
      expect(restored.name).toBe(original.name);
      expect(restored.path).toBe(original.path);
      expect(restored.createdAt).toEqual(original.createdAt);
      expect(restored.updatedAt).toEqual(original.updatedAt);
      expect(restored.deletedAt).toBeUndefined();
    });

    it('should preserve deletedAt through round-trip', () => {
      const deletedAt = new Date('2025-06-02T09:00:00Z');
      const original = createTestRepository({ deletedAt });
      const row = toDatabase(original);
      const restored = fromDatabase(row);

      expect(restored.deletedAt).toEqual(deletedAt);
    });

    it('should preserve remoteUrl through round-trip', () => {
      const original = createTestRepository({ remoteUrl: 'https://github.com/owner/repo' });
      const row = toDatabase(original);
      const restored = fromDatabase(row);

      expect(restored.remoteUrl).toBe('https://github.com/owner/repo');
    });

    it('should preserve undefined remoteUrl through round-trip', () => {
      const original = createTestRepository();
      const row = toDatabase(original);
      const restored = fromDatabase(row);

      expect(restored.remoteUrl).toBeUndefined();
    });
  });
});
