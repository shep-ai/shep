/**
 * Unit tests for cluster defaults factory
 */
import { describe, it, expect } from 'vitest';
import { createDefaultCluster } from '../../../../packages/core/src/domain/factories/cluster-defaults.factory';
import { ClusterStatus } from '../../../../packages/core/src/domain/generated/output';

describe('createDefaultCluster', () => {
  it('should create a cluster with required fields', () => {
    const cluster = createDefaultCluster('test-cluster');

    expect(cluster.id).toBeDefined();
    expect(cluster.name).toBe('test-cluster');
    expect(cluster.slug).toBe('test-cluster');
    expect(cluster.status).toBe(ClusterStatus.Stopped);
    expect(cluster.argoCdEnabled).toBe(false);
    expect(cluster.argoCdNamespace).toBe('argocd');
    expect(cluster.nodeCount).toBe(1);
    expect(cluster.createdAt).toBeDefined();
    expect(cluster.updatedAt).toBeDefined();
  });

  it('should generate valid UUID for id', () => {
    const cluster = createDefaultCluster('test-cluster');
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    expect(cluster.id).toMatch(uuidRegex);
  });

  it('should generate slug from name (lowercase, alphanumeric + hyphens)', () => {
    const cluster = createDefaultCluster('My Test Cluster');
    expect(cluster.slug).toBe('my-test-cluster');
  });

  it('should handle names with special characters', () => {
    const cluster = createDefaultCluster('Production! Cluster@2024');
    expect(cluster.slug).toBe('production-cluster2024');
  });

  it('should handle names with multiple spaces', () => {
    const cluster = createDefaultCluster('my    cluster    name');
    expect(cluster.slug).toBe('my-cluster-name');
  });

  it('should remove leading and trailing hyphens from slug', () => {
    const cluster1 = createDefaultCluster('-test-cluster-');
    expect(cluster1.slug).toBe('test-cluster');

    const cluster2 = createDefaultCluster('---cluster---');
    expect(cluster2.slug).toBe('cluster');
  });

  it('should default status to Stopped', () => {
    const cluster = createDefaultCluster('test-cluster');
    expect(cluster.status).toBe(ClusterStatus.Stopped);
  });

  it('should default argoCdEnabled to false', () => {
    const cluster = createDefaultCluster('test-cluster');
    expect(cluster.argoCdEnabled).toBe(false);
  });

  it('should default argoCdNamespace to "argocd"', () => {
    const cluster = createDefaultCluster('test-cluster');
    expect(cluster.argoCdNamespace).toBe('argocd');
  });

  it('should default nodeCount to 1', () => {
    const cluster = createDefaultCluster('test-cluster');
    expect(cluster.nodeCount).toBe(1);
  });

  it('should set optional fields to undefined', () => {
    const cluster = createDefaultCluster('test-cluster');
    expect(cluster.description).toBeUndefined();
    expect(cluster.k3dClusterName).toBeUndefined();
    expect(cluster.kubeconfigPath).toBeUndefined();
    expect(cluster.lastProvisionedAt).toBeUndefined();
    expect(cluster.lastHealthCheckAt).toBeUndefined();
    expect(cluster.errorMessage).toBeUndefined();
    expect(cluster.deletedAt).toBeUndefined();
  });

  it('should accept description via options', () => {
    const cluster = createDefaultCluster('test-cluster', {
      description: 'Production deployment target',
    });
    expect(cluster.description).toBe('Production deployment target');
  });

  it('should accept argoCdEnabled override', () => {
    const cluster = createDefaultCluster('test-cluster', {
      argoCdEnabled: true,
    });
    expect(cluster.argoCdEnabled).toBe(true);
  });

  it('should accept argoCdNamespace override', () => {
    const cluster = createDefaultCluster('test-cluster', {
      argoCdNamespace: 'custom-namespace',
    });
    expect(cluster.argoCdNamespace).toBe('custom-namespace');
  });

  it('should accept nodeCount override', () => {
    const cluster = createDefaultCluster('test-cluster', {
      nodeCount: 3,
    });
    expect(cluster.nodeCount).toBe(3);
  });

  it('should accept multiple options simultaneously', () => {
    const cluster = createDefaultCluster('production', {
      description: 'Main production cluster',
      argoCdEnabled: true,
      argoCdNamespace: 'argocd-prod',
      nodeCount: 3,
    });

    expect(cluster.name).toBe('production');
    expect(cluster.slug).toBe('production');
    expect(cluster.description).toBe('Main production cluster');
    expect(cluster.argoCdEnabled).toBe(true);
    expect(cluster.argoCdNamespace).toBe('argocd-prod');
    expect(cluster.nodeCount).toBe(3);
  });

  it('should generate unique IDs for each call', () => {
    const cluster1 = createDefaultCluster('test-cluster');
    const cluster2 = createDefaultCluster('test-cluster');

    expect(cluster1.id).not.toBe(cluster2.id);
  });

  it('should set createdAt and updatedAt to same timestamp', () => {
    const cluster = createDefaultCluster('test-cluster');
    expect(cluster.createdAt).toBe(cluster.updatedAt);
  });
});
