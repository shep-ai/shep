import { describe, it, expect } from 'vitest';
import {
  toDatabase,
  fromDatabase,
  type ClusterRow,
} from '@/infrastructure/persistence/sqlite/mappers/cluster.mapper.js';
import { ClusterStatus, type Cluster } from '@/domain/generated/output.js';

function createTestCluster(overrides: Partial<Cluster> = {}): Cluster {
  return {
    id: 'cluster-abc-123',
    name: 'My Cluster',
    slug: 'my-cluster',
    status: ClusterStatus.Stopped,
    argoCdEnabled: false,
    argoCdNamespace: 'argocd',
    nodeCount: 1,
    createdAt: new Date('2026-03-22T10:00:00Z'),
    updatedAt: new Date('2026-03-22T12:00:00Z'),
    ...overrides,
  };
}

function createTestRow(overrides: Partial<ClusterRow> = {}): ClusterRow {
  return {
    id: 'cluster-abc-123',
    name: 'My Cluster',
    slug: 'my-cluster',
    description: null,
    status: 'Stopped',
    k3d_cluster_name: null,
    kubeconfig_path: null,
    argocd_enabled: 0,
    argocd_namespace: 'argocd',
    node_count: 1,
    last_provisioned_at: null,
    last_health_check_at: null,
    error_message: null,
    created_at: new Date('2026-03-22T10:00:00Z').getTime(),
    updated_at: new Date('2026-03-22T12:00:00Z').getTime(),
    deleted_at: null,
    ...overrides,
  };
}

describe('Cluster Mapper', () => {
  describe('toDatabase', () => {
    it('should map all fields to snake_case columns', () => {
      const cluster = createTestCluster();
      const row = toDatabase(cluster);

      expect(row.id).toBe('cluster-abc-123');
      expect(row.name).toBe('My Cluster');
      expect(row.slug).toBe('my-cluster');
      expect(row.description).toBeNull();
      expect(row.status).toBe('Stopped');
      expect(row.k3d_cluster_name).toBeNull();
      expect(row.kubeconfig_path).toBeNull();
      expect(row.argocd_enabled).toBe(0);
      expect(row.argocd_namespace).toBe('argocd');
      expect(row.node_count).toBe(1);
      expect(row.last_provisioned_at).toBeNull();
      expect(row.last_health_check_at).toBeNull();
      expect(row.error_message).toBeNull();
      expect(row.created_at).toBe(new Date('2026-03-22T10:00:00Z').getTime());
      expect(row.updated_at).toBe(new Date('2026-03-22T12:00:00Z').getTime());
      expect(row.deleted_at).toBeNull();
    });

    it('should convert argoCdEnabled true to 1', () => {
      const cluster = createTestCluster({ argoCdEnabled: true });
      const row = toDatabase(cluster);
      expect(row.argocd_enabled).toBe(1);
    });

    it('should convert argoCdEnabled false to 0', () => {
      const cluster = createTestCluster({ argoCdEnabled: false });
      const row = toDatabase(cluster);
      expect(row.argocd_enabled).toBe(0);
    });

    it('should convert Date objects to unix milliseconds', () => {
      const date = new Date('2026-01-15T08:30:00Z');
      const cluster = createTestCluster({ createdAt: date });
      const row = toDatabase(cluster);
      expect(row.created_at).toBe(date.getTime());
    });

    it('should convert optional Date fields to unix milliseconds', () => {
      const provisioned = new Date('2026-03-20T10:00:00Z');
      const healthCheck = new Date('2026-03-22T08:00:00Z');
      const cluster = createTestCluster({
        lastProvisionedAt: provisioned,
        lastHealthCheckAt: healthCheck,
      });
      const row = toDatabase(cluster);
      expect(row.last_provisioned_at).toBe(provisioned.getTime());
      expect(row.last_health_check_at).toBe(healthCheck.getTime());
    });

    it('should map optional string fields to their values or null', () => {
      const cluster = createTestCluster({
        description: 'My dev cluster',
        k3dClusterName: 'k3d-my-cluster',
        kubeconfigPath: '/home/user/.shep/clusters/abc/kubeconfig',
        errorMessage: 'Something went wrong',
      });
      const row = toDatabase(cluster);
      expect(row.description).toBe('My dev cluster');
      expect(row.k3d_cluster_name).toBe('k3d-my-cluster');
      expect(row.kubeconfig_path).toBe('/home/user/.shep/clusters/abc/kubeconfig');
      expect(row.error_message).toBe('Something went wrong');
    });

    it('should map undefined optional strings to null', () => {
      const cluster = createTestCluster();
      const row = toDatabase(cluster);
      expect(row.description).toBeNull();
      expect(row.k3d_cluster_name).toBeNull();
      expect(row.kubeconfig_path).toBeNull();
      expect(row.error_message).toBeNull();
    });

    it('should map deletedAt Date to unix milliseconds', () => {
      const deletedAt = new Date('2026-06-02T09:00:00Z');
      const cluster = createTestCluster({ deletedAt });
      const row = toDatabase(cluster);
      expect(row.deleted_at).toBe(deletedAt.getTime());
    });

    it('should map undefined deletedAt to null', () => {
      const cluster = createTestCluster();
      const row = toDatabase(cluster);
      expect(row.deleted_at).toBeNull();
    });
  });

  describe('fromDatabase', () => {
    it('should map all columns to camelCase fields', () => {
      const row = createTestRow();
      const cluster = fromDatabase(row);

      expect(cluster.id).toBe('cluster-abc-123');
      expect(cluster.name).toBe('My Cluster');
      expect(cluster.slug).toBe('my-cluster');
      expect(cluster.description).toBeUndefined();
      expect(cluster.status).toBe(ClusterStatus.Stopped);
      expect(cluster.k3dClusterName).toBeUndefined();
      expect(cluster.kubeconfigPath).toBeUndefined();
      expect(cluster.argoCdEnabled).toBe(false);
      expect(cluster.argoCdNamespace).toBe('argocd');
      expect(cluster.nodeCount).toBe(1);
      expect(cluster.lastProvisionedAt).toBeUndefined();
      expect(cluster.lastHealthCheckAt).toBeUndefined();
      expect(cluster.errorMessage).toBeUndefined();
      expect(cluster.createdAt).toBeInstanceOf(Date);
      expect(cluster.updatedAt).toBeInstanceOf(Date);
      expect(cluster.deletedAt).toBeUndefined();
    });

    it('should convert argocd_enabled 1 to true', () => {
      const row = createTestRow({ argocd_enabled: 1 });
      const cluster = fromDatabase(row);
      expect(cluster.argoCdEnabled).toBe(true);
    });

    it('should convert argocd_enabled 0 to false', () => {
      const row = createTestRow({ argocd_enabled: 0 });
      const cluster = fromDatabase(row);
      expect(cluster.argoCdEnabled).toBe(false);
    });

    it('should convert unix milliseconds back to Date objects', () => {
      const date = new Date('2026-01-15T08:30:00Z');
      const row = createTestRow({ created_at: date.getTime() });
      const cluster = fromDatabase(row);
      expect(cluster.createdAt).toEqual(date);
    });

    it('should convert optional timestamp columns to Date objects', () => {
      const provisioned = new Date('2026-03-20T10:00:00Z');
      const healthCheck = new Date('2026-03-22T08:00:00Z');
      const row = createTestRow({
        last_provisioned_at: provisioned.getTime(),
        last_health_check_at: healthCheck.getTime(),
      });
      const cluster = fromDatabase(row);
      expect(cluster.lastProvisionedAt).toEqual(provisioned);
      expect(cluster.lastHealthCheckAt).toEqual(healthCheck);
    });

    it('should map null optional timestamps to undefined', () => {
      const row = createTestRow({
        last_provisioned_at: null,
        last_health_check_at: null,
      });
      const cluster = fromDatabase(row);
      expect(cluster.lastProvisionedAt).toBeUndefined();
      expect(cluster.lastHealthCheckAt).toBeUndefined();
    });

    it('should map non-null optional strings to their values', () => {
      const row = createTestRow({
        description: 'My dev cluster',
        k3d_cluster_name: 'k3d-my-cluster',
        kubeconfig_path: '/home/user/.shep/clusters/abc/kubeconfig',
        error_message: 'Something went wrong',
      });
      const cluster = fromDatabase(row);
      expect(cluster.description).toBe('My dev cluster');
      expect(cluster.k3dClusterName).toBe('k3d-my-cluster');
      expect(cluster.kubeconfigPath).toBe('/home/user/.shep/clusters/abc/kubeconfig');
      expect(cluster.errorMessage).toBe('Something went wrong');
    });

    it('should map null optional strings to undefined', () => {
      const row = createTestRow();
      const cluster = fromDatabase(row);
      expect(cluster.description).toBeUndefined();
      expect(cluster.k3dClusterName).toBeUndefined();
      expect(cluster.kubeconfigPath).toBeUndefined();
      expect(cluster.errorMessage).toBeUndefined();
    });

    it('should cast status string to ClusterStatus enum', () => {
      const row = createTestRow({ status: 'Provisioning' });
      const cluster = fromDatabase(row);
      expect(cluster.status).toBe(ClusterStatus.Provisioning);
    });

    it('should map deleted_at integer to Date', () => {
      const deletedAt = new Date('2026-06-02T09:00:00Z');
      const row = createTestRow({ deleted_at: deletedAt.getTime() });
      const cluster = fromDatabase(row);
      expect(cluster.deletedAt).toEqual(deletedAt);
    });

    it('should map null deleted_at to undefined', () => {
      const row = createTestRow({ deleted_at: null });
      const cluster = fromDatabase(row);
      expect(cluster.deletedAt).toBeUndefined();
    });
  });

  describe('round-trip', () => {
    it('should preserve all fields through toDatabase -> fromDatabase', () => {
      const original = createTestCluster({
        description: 'Production cluster',
        k3dClusterName: 'k3d-prod',
        kubeconfigPath: '/home/user/.shep/clusters/abc/kubeconfig',
        argoCdEnabled: true,
        argoCdNamespace: 'custom-argocd',
        nodeCount: 1,
        lastProvisionedAt: new Date('2026-03-20T10:00:00Z'),
        lastHealthCheckAt: new Date('2026-03-22T08:00:00Z'),
        errorMessage: 'Previous error',
        status: ClusterStatus.Ready,
      });
      const row = toDatabase(original);
      const restored = fromDatabase(row);

      expect(restored.id).toBe(original.id);
      expect(restored.name).toBe(original.name);
      expect(restored.slug).toBe(original.slug);
      expect(restored.description).toBe(original.description);
      expect(restored.status).toBe(original.status);
      expect(restored.k3dClusterName).toBe(original.k3dClusterName);
      expect(restored.kubeconfigPath).toBe(original.kubeconfigPath);
      expect(restored.argoCdEnabled).toBe(original.argoCdEnabled);
      expect(restored.argoCdNamespace).toBe(original.argoCdNamespace);
      expect(restored.nodeCount).toBe(original.nodeCount);
      expect(restored.lastProvisionedAt).toEqual(original.lastProvisionedAt);
      expect(restored.lastHealthCheckAt).toEqual(original.lastHealthCheckAt);
      expect(restored.errorMessage).toBe(original.errorMessage);
      expect(restored.createdAt).toEqual(original.createdAt);
      expect(restored.updatedAt).toEqual(original.updatedAt);
    });

    it('should preserve deletedAt through round-trip', () => {
      const deletedAt = new Date('2026-06-02T09:00:00Z');
      const original = createTestCluster({ deletedAt });
      const row = toDatabase(original);
      const restored = fromDatabase(row);
      expect(restored.deletedAt).toEqual(deletedAt);
    });

    it('should preserve undefined optional fields through round-trip', () => {
      const original = createTestCluster();
      const row = toDatabase(original);
      const restored = fromDatabase(row);

      expect(restored.description).toBeUndefined();
      expect(restored.k3dClusterName).toBeUndefined();
      expect(restored.kubeconfigPath).toBeUndefined();
      expect(restored.lastProvisionedAt).toBeUndefined();
      expect(restored.lastHealthCheckAt).toBeUndefined();
      expect(restored.errorMessage).toBeUndefined();
      expect(restored.deletedAt).toBeUndefined();
    });
  });
});
