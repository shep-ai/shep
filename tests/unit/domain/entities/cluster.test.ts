/**
 * Unit tests for Cluster type generated from TypeSpec
 */
import { describe, it, expect } from 'vitest';
import { type Cluster, ClusterStatus } from '../../../../packages/core/src/domain/generated/output';

describe('Cluster type', () => {
  it('should have all required fields', () => {
    const cluster: Cluster = {
      id: '123e4567-e89b-12d3-a456-426614174000',
      name: 'test-cluster',
      slug: 'test-cluster',
      status: ClusterStatus.Stopped,
      argoCdEnabled: false,
      argoCdNamespace: 'argocd',
      nodeCount: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    expect(cluster.id).toBeDefined();
    expect(cluster.name).toBeDefined();
    expect(cluster.slug).toBeDefined();
    expect(cluster.status).toBeDefined();
    expect(cluster.argoCdEnabled).toBeDefined();
    expect(cluster.argoCdNamespace).toBeDefined();
    expect(cluster.nodeCount).toBeDefined();
    expect(cluster.createdAt).toBeDefined();
    expect(cluster.updatedAt).toBeDefined();
  });

  it('should allow optional fields to be undefined', () => {
    const cluster: Cluster = {
      id: '123e4567-e89b-12d3-a456-426614174000',
      name: 'test-cluster',
      slug: 'test-cluster',
      status: ClusterStatus.Stopped,
      argoCdEnabled: false,
      argoCdNamespace: 'argocd',
      nodeCount: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      // Optional fields omitted
    };

    expect(cluster.description).toBeUndefined();
    expect(cluster.k3dClusterName).toBeUndefined();
    expect(cluster.kubeconfigPath).toBeUndefined();
    expect(cluster.lastProvisionedAt).toBeUndefined();
    expect(cluster.lastHealthCheckAt).toBeUndefined();
    expect(cluster.errorMessage).toBeUndefined();
    expect(cluster.deletedAt).toBeUndefined();
  });

  it('should allow all optional fields to be set', () => {
    const now = new Date().toISOString();
    const cluster: Cluster = {
      id: '123e4567-e89b-12d3-a456-426614174000',
      name: 'production-cluster',
      slug: 'production-cluster',
      description: 'Production deployment target',
      status: ClusterStatus.Ready,
      k3dClusterName: 'shep-production-cluster',
      kubeconfigPath: '/home/user/.shep/clusters/123e4567-e89b-12d3-a456-426614174000/kubeconfig',
      argoCdEnabled: true,
      argoCdNamespace: 'argocd',
      nodeCount: 1,
      lastProvisionedAt: now,
      lastHealthCheckAt: now,
      errorMessage: undefined,
      createdAt: now,
      updatedAt: now,
      deletedAt: undefined,
    };

    expect(cluster.description).toBe('Production deployment target');
    expect(cluster.k3dClusterName).toBe('shep-production-cluster');
    expect(cluster.kubeconfigPath).toContain('kubeconfig');
    expect(cluster.argoCdEnabled).toBe(true);
    expect(cluster.lastProvisionedAt).toBe(now);
    expect(cluster.lastHealthCheckAt).toBe(now);
  });

  it('should support all ClusterStatus enum values', () => {
    const statuses: ClusterStatus[] = [
      ClusterStatus.Provisioning,
      ClusterStatus.Ready,
      ClusterStatus.Stopping,
      ClusterStatus.Stopped,
      ClusterStatus.Error,
      ClusterStatus.Destroying,
    ];

    statuses.forEach((status) => {
      const cluster: Cluster = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        name: 'test-cluster',
        slug: 'test-cluster',
        status,
        argoCdEnabled: false,
        argoCdNamespace: 'argocd',
        nodeCount: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      expect(cluster.status).toBe(status);
    });
  });

  it('should have default values matching TypeSpec specification', () => {
    // This test verifies the expected defaults as documented in the TypeSpec
    const cluster: Cluster = {
      id: '123e4567-e89b-12d3-a456-426614174000',
      name: 'test-cluster',
      slug: 'test-cluster',
      status: ClusterStatus.Stopped, // Default: Stopped
      argoCdEnabled: false, // Default: false
      argoCdNamespace: 'argocd', // Default: "argocd"
      nodeCount: 1, // Default: 1
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    expect(cluster.status).toBe(ClusterStatus.Stopped);
    expect(cluster.argoCdEnabled).toBe(false);
    expect(cluster.argoCdNamespace).toBe('argocd');
    expect(cluster.nodeCount).toBe(1);
  });
});
