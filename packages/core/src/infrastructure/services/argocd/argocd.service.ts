/**
 * ArgoCD Service
 *
 * Infrastructure implementation of IArgoCDService.
 * Manages ArgoCD installations and applications using kubectl (no separate
 * argocd CLI binary required). ArgoCD is installed via kubectl apply of the
 * official manifests.
 */

import { injectable, inject } from 'tsyringe';
import type {
  IArgoCDService,
  ArgoCdStatus,
} from '../../../application/ports/output/services/argocd-service.interface.js';
import { KubectlError, KubectlErrorCode } from '../../errors/kubectl-error.js';
import type { ExecFunction } from '../git/worktree.service.js';

const ARGOCD_INSTALL_URL =
  'https://raw.githubusercontent.com/argoproj/argo-cd/stable/manifests/install.yaml';
const DEFAULT_ARGOCD_NAMESPACE = 'argocd';

@injectable()
export class ArgoCDService implements IArgoCDService {
  constructor(@inject('ExecFunction') private readonly execFile: ExecFunction) {}

  async install(kubeconfigPath: string, namespace?: string): Promise<void> {
    const ns = namespace ?? DEFAULT_ARGOCD_NAMESPACE;

    try {
      // Create namespace if it doesn't exist
      await this.execFile('kubectl', [
        'create',
        'namespace',
        ns,
        '--kubeconfig',
        kubeconfigPath,
        '--dry-run=client',
        '-o',
        'yaml',
      ]).then(({ stdout }) =>
        this.execFile('kubectl', ['apply', '-f', '-', '--kubeconfig', kubeconfigPath], {
          input: stdout,
        })
      );

      // Apply ArgoCD manifests
      await this.execFile('kubectl', [
        'apply',
        '-n',
        ns,
        '-f',
        ARGOCD_INSTALL_URL,
        '--kubeconfig',
        kubeconfigPath,
      ]);
    } catch (error) {
      throw this.parseError(error);
    }
  }

  async getStatus(kubeconfigPath: string, namespace?: string): Promise<ArgoCdStatus> {
    const ns = namespace ?? DEFAULT_ARGOCD_NAMESPACE;

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
          metadata: { name: string };
          status: {
            phase: string;
            containerStatuses?: { ready: boolean }[];
          };
        }[];
      };

      const pods = result.items;
      const serverPod = pods.find((p) => p.metadata.name.startsWith('argocd-server'));
      const serverReady = serverPod?.status.containerStatuses?.every((c) => c.ready) ?? false;

      return {
        installed: pods.length > 0,
        podCount: pods.length,
        serverReady,
      };
    } catch {
      return {
        installed: false,
        podCount: 0,
        serverReady: false,
      };
    }
  }

  async createApp(
    kubeconfigPath: string,
    appName: string,
    repoUrl: string,
    path: string,
    namespace?: string
  ): Promise<void> {
    const ns = namespace ?? DEFAULT_ARGOCD_NAMESPACE;

    const appManifest = {
      apiVersion: 'argoproj.io/v1alpha1',
      kind: 'Application',
      metadata: {
        name: appName,
        namespace: ns,
      },
      spec: {
        project: 'default',
        source: {
          repoURL: repoUrl,
          path,
          targetRevision: 'HEAD',
        },
        destination: {
          server: 'https://kubernetes.default.svc',
          namespace: 'default',
        },
        syncPolicy: {
          automated: {
            prune: true,
            selfHeal: true,
          },
        },
      },
    };

    try {
      await this.execFile('kubectl', ['apply', '-f', '-', '--kubeconfig', kubeconfigPath], {
        input: JSON.stringify(appManifest),
      });
    } catch (error) {
      throw this.parseError(error);
    }
  }

  async syncApp(kubeconfigPath: string, appName: string): Promise<void> {
    try {
      // Trigger sync by annotating the Application resource
      await this.execFile('kubectl', [
        'annotate',
        'application',
        appName,
        'argocd.argoproj.io/refresh=hard',
        '--overwrite',
        '-n',
        DEFAULT_ARGOCD_NAMESPACE,
        '--kubeconfig',
        kubeconfigPath,
      ]);
    } catch (error) {
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
    return new KubectlError(
      `ArgoCD operation failed: ${message}`,
      KubectlErrorCode.COMMAND_FAILED,
      error instanceof Error ? error : undefined
    );
  }

  private isBinaryNotFound(error: unknown): boolean {
    if (error && typeof error === 'object') {
      const err = error as Record<string, unknown>;
      if (err.code === 'ENOENT') return true;
    }
    return false;
  }

  private getErrorMessage(error: unknown): string {
    if (error instanceof Error) {
      const execError = error as Error & { stdout?: string; stderr?: string };
      return [execError.message, execError.stderr, execError.stdout].filter(Boolean).join(' ');
    }
    return String(error);
  }
}
