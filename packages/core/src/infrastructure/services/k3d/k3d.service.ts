/**
 * K3d Service
 *
 * Infrastructure implementation of IK3dService.
 * Wraps k3d CLI commands via execFile for managing k3s-in-Docker clusters.
 */

import { injectable, inject } from 'tsyringe';
import type {
  IK3dService,
  K3dCreateClusterOptions,
  K3dClusterStatus,
} from '../../../application/ports/output/services/k3d-service.interface.js';
import { K3dError, K3dErrorCode } from '../../errors/k3d-error.js';
import type { ExecFunction } from '../git/worktree.service.js';

@injectable()
export class K3dService implements IK3dService {
  constructor(@inject('ExecFunction') private readonly execFile: ExecFunction) {}

  async createCluster(name: string, options?: K3dCreateClusterOptions): Promise<void> {
    const args = ['cluster', 'create', name];
    if (options?.noLb !== false) {
      args.push('--no-lb');
    }
    if (options?.wait !== false) {
      args.push('--wait');
    }
    if (options?.timeoutSeconds) {
      args.push('--timeout', `${options.timeoutSeconds}s`);
    }

    try {
      await this.execFile('k3d', args);
    } catch (error) {
      throw this.parseError(error, name);
    }
  }

  async deleteCluster(name: string): Promise<void> {
    try {
      await this.execFile('k3d', ['cluster', 'delete', name]);
    } catch (error) {
      throw this.parseError(error, name);
    }
  }

  async startCluster(name: string): Promise<void> {
    try {
      await this.execFile('k3d', ['cluster', 'start', name]);
    } catch (error) {
      throw this.parseError(error, name);
    }
  }

  async stopCluster(name: string): Promise<void> {
    try {
      await this.execFile('k3d', ['cluster', 'stop', name]);
    } catch (error) {
      throw this.parseError(error, name);
    }
  }

  async getClusterStatus(name: string): Promise<K3dClusterStatus | null> {
    try {
      const { stdout } = await this.execFile('k3d', ['cluster', 'list', '-o', 'json']);
      const clusters = JSON.parse(stdout) as {
        name: string;
        serversRunning: number;
        serversCount: number;
      }[];
      const cluster = clusters.find((c) => c.name === name);
      if (!cluster) {
        return null;
      }
      return {
        exists: true,
        running: cluster.serversRunning > 0,
        serverCount: cluster.serversCount,
      };
    } catch (error) {
      if (this.isBinaryNotFound(error)) {
        throw new K3dError(
          'k3d binary not found. Install k3d: https://k3d.io/',
          K3dErrorCode.BINARY_NOT_FOUND,
          error instanceof Error ? error : undefined
        );
      }
      return null;
    }
  }

  async getKubeconfig(name: string): Promise<string> {
    try {
      const { stdout } = await this.execFile('k3d', ['kubeconfig', 'get', name]);
      return stdout;
    } catch (error) {
      throw this.parseError(error, name);
    }
  }

  private parseError(error: unknown, clusterName?: string): K3dError {
    if (this.isBinaryNotFound(error)) {
      return new K3dError(
        'k3d binary not found. Install k3d: https://k3d.io/',
        K3dErrorCode.BINARY_NOT_FOUND,
        error instanceof Error ? error : undefined
      );
    }

    const message = this.getErrorMessage(error);

    if (message.includes('already exists')) {
      return new K3dError(
        `Cluster "${clusterName}" already exists`,
        K3dErrorCode.CLUSTER_EXISTS,
        error instanceof Error ? error : undefined
      );
    }

    if (message.includes('not found') || message.includes('does not exist')) {
      return new K3dError(
        `Cluster "${clusterName}" not found`,
        K3dErrorCode.CLUSTER_NOT_FOUND,
        error instanceof Error ? error : undefined
      );
    }

    if (message.includes('timed out') || message.includes('timeout')) {
      return new K3dError(
        `Operation timed out for cluster "${clusterName}"`,
        K3dErrorCode.TIMEOUT,
        error instanceof Error ? error : undefined
      );
    }

    return new K3dError(
      `k3d command failed: ${message}`,
      K3dErrorCode.COMMAND_FAILED,
      error instanceof Error ? error : undefined
    );
  }

  private isBinaryNotFound(error: unknown): boolean {
    if (error && typeof error === 'object') {
      const err = error as Record<string, unknown>;
      if (err.code === 'ENOENT') return true;
    }
    const message = this.getErrorMessage(error);
    return message.includes('ENOENT') || message.includes('spawn k3d');
  }

  private getErrorMessage(error: unknown): string {
    if (error instanceof Error) {
      // execFile errors may have stdout/stderr with more details
      const execError = error as Error & { stdout?: string; stderr?: string };
      return [execError.message, execError.stderr, execError.stdout].filter(Boolean).join(' ');
    }
    return String(error);
  }
}
