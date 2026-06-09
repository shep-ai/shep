/**
 * Unit tests for ClusterRepository and ClusterApplication junction types generated from TypeSpec
 */
import { describe, it, expect } from 'vitest';
import {
  type ClusterRepository,
  type ClusterApplication,
} from '../../../../packages/core/src/domain/generated/output';

describe('ClusterRepository junction type', () => {
  it('should have all required fields', () => {
    const junction: ClusterRepository = {
      id: '123e4567-e89b-12d3-a456-426614174000',
      clusterId: '456e7890-e89b-12d3-a456-426614174001',
      repositoryId: '789e0123-e89b-12d3-a456-426614174002',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    expect(junction.id).toBeDefined();
    expect(junction.clusterId).toBeDefined();
    expect(junction.repositoryId).toBeDefined();
    expect(junction.createdAt).toBeDefined();
    expect(junction.updatedAt).toBeDefined();
  });

  it('should extend BaseEntity with UUID fields', () => {
    const now = new Date().toISOString();
    const junction: ClusterRepository = {
      id: '123e4567-e89b-12d3-a456-426614174000',
      clusterId: '456e7890-e89b-12d3-a456-426614174001',
      repositoryId: '789e0123-e89b-12d3-a456-426614174002',
      createdAt: now,
      updatedAt: now,
    };

    // Verify BaseEntity fields
    expect(junction.id).toBe('123e4567-e89b-12d3-a456-426614174000');
    expect(junction.createdAt).toBe(now);
    expect(junction.updatedAt).toBe(now);

    // Verify junction-specific fields
    expect(junction.clusterId).toBe('456e7890-e89b-12d3-a456-426614174001');
    expect(junction.repositoryId).toBe('789e0123-e89b-12d3-a456-426614174002');
  });

  it('should not have deletedAt field (hard-delete only)', () => {
    const junction: ClusterRepository = {
      id: '123e4567-e89b-12d3-a456-426614174000',
      clusterId: '456e7890-e89b-12d3-a456-426614174001',
      repositoryId: '789e0123-e89b-12d3-a456-426614174002',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    // Type assertion: deletedAt should not exist on ClusterRepository
    expect('deletedAt' in junction).toBe(false);
  });
});

describe('ClusterApplication junction type', () => {
  it('should have all required fields', () => {
    const junction: ClusterApplication = {
      id: '123e4567-e89b-12d3-a456-426614174000',
      clusterId: '456e7890-e89b-12d3-a456-426614174001',
      applicationId: '789e0123-e89b-12d3-a456-426614174002',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    expect(junction.id).toBeDefined();
    expect(junction.clusterId).toBeDefined();
    expect(junction.applicationId).toBeDefined();
    expect(junction.createdAt).toBeDefined();
    expect(junction.updatedAt).toBeDefined();
  });

  it('should extend BaseEntity with UUID fields', () => {
    const now = new Date().toISOString();
    const junction: ClusterApplication = {
      id: '123e4567-e89b-12d3-a456-426614174000',
      clusterId: '456e7890-e89b-12d3-a456-426614174001',
      applicationId: '789e0123-e89b-12d3-a456-426614174002',
      createdAt: now,
      updatedAt: now,
    };

    // Verify BaseEntity fields
    expect(junction.id).toBe('123e4567-e89b-12d3-a456-426614174000');
    expect(junction.createdAt).toBe(now);
    expect(junction.updatedAt).toBe(now);

    // Verify junction-specific fields
    expect(junction.clusterId).toBe('456e7890-e89b-12d3-a456-426614174001');
    expect(junction.applicationId).toBe('789e0123-e89b-12d3-a456-426614174002');
  });

  it('should not have deletedAt field (hard-delete only)', () => {
    const junction: ClusterApplication = {
      id: '123e4567-e89b-12d3-a456-426614174000',
      clusterId: '456e7890-e89b-12d3-a456-426614174001',
      applicationId: '789e0123-e89b-12d3-a456-426614174002',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    // Type assertion: deletedAt should not exist on ClusterApplication
    expect('deletedAt' in junction).toBe(false);
  });
});

describe('Junction types comparison', () => {
  it('should have identical structure except for foreign key field names', () => {
    const repoJunction: ClusterRepository = {
      id: '123e4567-e89b-12d3-a456-426614174000',
      clusterId: '456e7890-e89b-12d3-a456-426614174001',
      repositoryId: '789e0123-e89b-12d3-a456-426614174002',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const appJunction: ClusterApplication = {
      id: '123e4567-e89b-12d3-a456-426614174000',
      clusterId: '456e7890-e89b-12d3-a456-426614174001',
      applicationId: '789e0123-e89b-12d3-a456-426614174002',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    // Both have same BaseEntity structure
    expect(Object.keys(repoJunction).sort()).toEqual(
      ['id', 'clusterId', 'repositoryId', 'createdAt', 'updatedAt'].sort()
    );
    expect(Object.keys(appJunction).sort()).toEqual(
      ['id', 'clusterId', 'applicationId', 'createdAt', 'updatedAt'].sort()
    );

    // Both share clusterId
    expect(repoJunction.clusterId).toBe(appJunction.clusterId);
  });
});
