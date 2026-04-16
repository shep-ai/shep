/**
 * Kubectl Service
 *
 * Infrastructure implementation of IKubectlService.
 * Wraps kubectl CLI commands via execFile for Kubernetes cluster operations.
 * All methods require an explicit kubeconfig path for resource isolation (NFR-2).
 */

import { injectable, inject } from 'tsyringe';
import type {
  IKubectlService,
  KubePod,
  KubeService,
} from '../../../application/ports/output/services/kubectl-service.interface.js';
import { KubectlError, KubectlErrorCode } from '../../errors/kubectl-error.js';
import type { ExecFunction } from '../git/worktree.service.js';

const DEFAULT_NAMESPACE = 'default';

@injectable()
export class KubectlService implements IKubectlService {
  constructor(@inject('ExecFunction') private readonly execFile: ExecFunction) {}

  async apply(kubeconfigPath: string, manifestPath: string): Promise<void> {
    try {
      await this.execFile('kubectl', ['apply', '-f', manifestPath, '--kubeconfig', kubeconfigPath]);
    } catch (error) {
      throw this.parseError(error);
    }
  }

  async applyStdin(kubeconfigPath: string, yamlContent: string): Promise<void> {
    try {
      await this.execFile('kubectl', ['apply', '-f', '-', '--kubeconfig', kubeconfigPath], {
        input: yamlContent,
      });
    } catch (error) {
      throw this.parseError(error);
    }
  }

  async getNamespaces(kubeconfigPath: string): Promise<string[]> {
    try {
      const { stdout } = await this.execFile('kubectl', [
        'get',
        'namespaces',
        '-o',
        'json',
        '--kubeconfig',
        kubeconfigPath,
      ]);
      const result = JSON.parse(stdout) as {
        items: { metadata: { name: string } }[];
      };
      return result.items.map((ns) => ns.metadata.name);
    } catch (error) {
      throw this.parseError(error);
    }
  }

  async getPods(kubeconfigPath: string, namespace?: string): Promise<KubePod[]> {
    const ns = namespace ?? DEFAULT_NAMESPACE;
    try {
      const { stdout } = await this.execFile('kubectl', [
        'get',
        'pods',
        '-n',
        ns,
        '-o',
        'json',
        '--kubeconfig',
        kubeconfigPath,
      ]);
      const result = JSON.parse(stdout) as {
        items: {
          metadata: { name: string; namespace: string };
          status: {
            phase: string;
            containerStatuses?: { ready: boolean }[];
          };
        }[];
      };
      return result.items.map((pod) => ({
        name: pod.metadata.name,
        namespace: pod.metadata.namespace,
        status: pod.status.phase,
        ready: pod.status.containerStatuses?.every((c) => c.ready) ?? false,
      }));
    } catch (error) {
      throw this.parseError(error);
    }
  }

  async getServices(kubeconfigPath: string, namespace?: string): Promise<KubeService[]> {
    const ns = namespace ?? DEFAULT_NAMESPACE;
    try {
      const { stdout } = await this.execFile('kubectl', [
        'get',
        'services',
        '-n',
        ns,
        '-o',
        'json',
        '--kubeconfig',
        kubeconfigPath,
      ]);
      const result = JSON.parse(stdout) as {
        items: {
          metadata: { name: string; namespace: string };
          spec: {
            type: string;
            clusterIP: string;
            ports?: { port: number; targetPort: number | string; protocol: string }[];
          };
        }[];
      };
      return result.items.map((svc) => ({
        name: svc.metadata.name,
        namespace: svc.metadata.namespace,
        type: svc.spec.type,
        clusterIp: svc.spec.clusterIP,
        ports: (svc.spec.ports ?? []).map((p) => `${p.port}/${p.protocol}`).join(', '),
      }));
    } catch (error) {
      throw this.parseError(error);
    }
  }

  async waitForReady(
    kubeconfigPath: string,
    resource: string,
    timeoutSeconds: number
  ): Promise<void> {
    try {
      await this.execFile('kubectl', [
        'wait',
        '--for=condition=Ready',
        resource,
        '--timeout',
        `${timeoutSeconds}s`,
        '--kubeconfig',
        kubeconfigPath,
      ]);
    } catch (error) {
      const message = this.getErrorMessage(error);
      if (message.includes('timed out') || message.includes('timeout')) {
        throw new KubectlError(
          `Timed out waiting for ${resource} to become ready`,
          KubectlErrorCode.TIMEOUT,
          error instanceof Error ? error : undefined
        );
      }
      throw this.parseError(error);
    }
  }

  private parseError(error: unknown): KubectlError {
    if (this.isBinaryNotFound(error)) {
      return new KubectlError(
        'kubectl binary not found. Install kubectl: https://kubernetes.io/docs/tasks/tools/',
        KubectlErrorCode.BINARY_NOT_FOUND,
        error instanceof Error ? error : undefined
      );
    }

    const message = this.getErrorMessage(error);

    if (message.includes('not found') || message.includes('NotFound')) {
      return new KubectlError(
        message,
        KubectlErrorCode.RESOURCE_NOT_FOUND,
        error instanceof Error ? error : undefined
      );
    }

    if (message.includes('error when creating') || message.includes('error when applying')) {
      return new KubectlError(
        message,
        KubectlErrorCode.APPLY_FAILED,
        error instanceof Error ? error : undefined
      );
    }

    return new KubectlError(
      `kubectl command failed: ${message}`,
      KubectlErrorCode.COMMAND_FAILED,
      error instanceof Error ? error : undefined
    );
  }

  private isBinaryNotFound(error: unknown): boolean {
    if (error && typeof error === 'object') {
      const err = error as Record<string, unknown>;
      if (err.code === 'ENOENT') return true;
    }
    const message = this.getErrorMessage(error);
    return message.includes('ENOENT');
  }

  private getErrorMessage(error: unknown): string {
    if (error instanceof Error) {
      const execError = error as Error & { stdout?: string; stderr?: string };
      return [execError.message, execError.stderr, execError.stdout].filter(Boolean).join(' ');
    }
    return String(error);
  }
}
