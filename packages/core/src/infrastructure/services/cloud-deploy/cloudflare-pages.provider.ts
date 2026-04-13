/**
 * CloudflarePagesProvider
 *
 * Live ICloudDeploymentProvider adapter for Cloudflare Pages.
 *
 * Deploy pipeline (happy path):
 *   1. Verify token + discover account id
 *   2. Ensure project exists (create if missing)
 *   3. Upload build output via wrangler CLI fallback
 *      (the Cloudflare direct-upload multi-part HTTP protocol is handled by
 *      wrangler internally; calling it from our ExecFunction lets us stay
 *      zero-dep and correct.)
 *   4. Poll the newly-created deployment until success/failure
 *   5. Emit Uploading → Deploying → Deployed via onProgress
 *
 * Spec 089 — research §1 + §7.
 */

import { inject, injectable } from 'tsyringe';

import type { ExecFunction } from '../git/worktree.service.js';
import type { ICloudProviderTokensRepository } from '../../../application/ports/output/repositories/cloud-provider-tokens.repository.interface.js';
import {
  CloudProviderNotConnectedError,
  type CloudDeployInput,
  type CloudDeployProgressHandler,
  type CloudDeployResult,
  type ICloudDeploymentProvider,
} from '../../../application/ports/output/services/cloud-deployment-provider.interface.js';
import {
  CloudDeploymentProvider,
  CloudDeploymentStatus,
} from '../../../domain/generated/output.js';
import {
  CloudflareAccountMissingError,
  CloudflareApiError,
  CloudflareTokenInvalidError,
} from './cloud-deployment-errors.js';

const CLOUDFLARE_API_BASE = 'https://api.cloudflare.com/client/v4';
const POLL_INTERVAL_MS = 2000;
const POLL_TIMEOUT_MS = 10 * 60 * 1000;

export type FetchFunction = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

interface CloudflareEnvelope<T> {
  success: boolean;
  result: T;
  errors: { code: number; message: string }[];
  messages: unknown[];
}

interface CloudflareAccount {
  id: string;
  name: string;
}

interface CloudflarePagesProject {
  name: string;
  subdomain?: string;
}

interface CloudflarePagesDeployment {
  id: string;
  url?: string;
  latest_stage?: {
    name: string;
    status: 'idle' | 'active' | 'success' | 'failure' | 'canceled' | 'skipped';
  };
}

@injectable()
export class CloudflarePagesProvider implements ICloudDeploymentProvider {
  readonly providerId = CloudDeploymentProvider.CloudflarePages;
  readonly displayName = 'Cloudflare Pages';
  readonly enabled = true;

  constructor(
    @inject('ICloudProviderTokensRepository')
    private readonly tokens: ICloudProviderTokensRepository,
    @inject('FetchFunction') private readonly fetchFn: FetchFunction,
    @inject('ExecFunction') private readonly execFile: ExecFunction,
    @inject('CloudflareProviderClock')
    private readonly clock: { now: () => number; sleep: (ms: number) => Promise<void> } = {
      now: () => Date.now(),
      sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
    }
  ) {}

  async isConnected(): Promise<boolean> {
    const token = await this.tokens.get(CloudDeploymentProvider.CloudflarePages);
    if (!token) return false;
    try {
      await this.verifyToken(token);
      return true;
    } catch {
      return false;
    }
  }

  async validateToken(token: string): Promise<void> {
    await this.verifyToken(token);
    await this.discoverAccountId(token);
  }

  async deploy(
    input: CloudDeployInput,
    onProgress: CloudDeployProgressHandler
  ): Promise<CloudDeployResult> {
    const token = await this.tokens.get(CloudDeploymentProvider.CloudflarePages);
    if (!token) throw new CloudProviderNotConnectedError(this.providerId);

    const accountId = await this.discoverAccountId(token);
    await this.ensureProject(token, accountId, input.projectName);

    onProgress(CloudDeploymentStatus.Uploading, 'Uploading build output to Cloudflare Pages');
    const deploymentId = await this.runWranglerDeploy(
      token,
      accountId,
      input.projectName,
      input.buildOutputDir
    );

    onProgress(CloudDeploymentStatus.Deploying, 'Cloudflare is finalising the deployment');
    const result = await this.pollUntilFinished(token, accountId, input.projectName, deploymentId);

    onProgress(CloudDeploymentStatus.Deployed, `Live at ${result.url}`);
    return { deploymentId: result.id, url: result.url ?? '' };
  }

  async getStatus(
    deploymentId: string
  ): Promise<{ status: CloudDeploymentStatus; url?: string; error?: string }> {
    const token = await this.tokens.get(CloudDeploymentProvider.CloudflarePages);
    if (!token) throw new CloudProviderNotConnectedError(this.providerId);
    const accountId = await this.discoverAccountId(token);
    // We need the project name to fetch a single deployment — callers that
    // only know the deployment id should usually rely on the Application row
    // instead. This method exists for re-hydration flows.
    // Fallback: scan projects until we find the deployment.
    const projects = await this.listProjects(token, accountId);
    for (const project of projects) {
      try {
        const dep = await this.getDeployment(token, accountId, project.name, deploymentId);
        return {
          status: mapStageToStatus(dep.latest_stage?.status),
          url: dep.url,
        };
      } catch {
        // Try the next project.
      }
    }
    return { status: CloudDeploymentStatus.Failed, error: 'deployment not found' };
  }

  // ─────────────── internals ───────────────

  private async verifyToken(token: string): Promise<void> {
    const res = await this.request<{ status: string }>(
      'GET',
      '/user/tokens/verify',
      token,
      undefined
    );
    if (res.status !== 'active') {
      throw new CloudflareTokenInvalidError(`Token status is ${res.status}, expected 'active'`);
    }
  }

  private async discoverAccountId(token: string): Promise<string> {
    const accounts = await this.request<CloudflareAccount[]>('GET', '/accounts', token, undefined);
    const first = accounts[0];
    if (!first) throw new CloudflareAccountMissingError();
    return first.id;
  }

  private async ensureProject(token: string, accountId: string, name: string): Promise<void> {
    const projects = await this.listProjects(token, accountId);
    if (projects.some((p) => p.name === name)) return;
    try {
      await this.request<CloudflarePagesProject>(
        'POST',
        `/accounts/${accountId}/pages/projects`,
        token,
        { name, production_branch: 'main' }
      );
    } catch (err) {
      if (err instanceof CloudflareApiError && err.status === 409) return; // already exists
      throw err;
    }
  }

  private async listProjects(token: string, accountId: string): Promise<CloudflarePagesProject[]> {
    return this.request<CloudflarePagesProject[]>(
      'GET',
      `/accounts/${accountId}/pages/projects`,
      token,
      undefined
    );
  }

  private async getDeployment(
    token: string,
    accountId: string,
    projectName: string,
    deploymentId: string
  ): Promise<CloudflarePagesDeployment> {
    return this.request<CloudflarePagesDeployment>(
      'GET',
      `/accounts/${accountId}/pages/projects/${projectName}/deployments/${deploymentId}`,
      token,
      undefined
    );
  }

  private async pollUntilFinished(
    token: string,
    accountId: string,
    projectName: string,
    deploymentId: string
  ): Promise<CloudflarePagesDeployment> {
    const deadline = this.clock.now() + POLL_TIMEOUT_MS;
    while (this.clock.now() < deadline) {
      const dep = await this.getDeployment(token, accountId, projectName, deploymentId);
      const status = dep.latest_stage?.status;
      if (status === 'success') return dep;
      if (status === 'failure' || status === 'canceled') {
        throw new CloudflareApiError(`Cloudflare Pages deployment ${status}`, 0, []);
      }
      await this.clock.sleep(POLL_INTERVAL_MS);
    }
    throw new CloudflareApiError('Cloudflare Pages deployment polling timed out', 0);
  }

  private async runWranglerDeploy(
    token: string,
    accountId: string,
    projectName: string,
    buildDir: string
  ): Promise<string> {
    const { stdout } = await this.execFile(
      'npx',
      ['wrangler', 'pages', 'deploy', buildDir, `--project-name=${projectName}`, '--branch=main'],
      {
        env: {
          ...process.env,
          CLOUDFLARE_API_TOKEN: token,
          CLOUDFLARE_ACCOUNT_ID: accountId,
        },
      }
    );
    // Wrangler prints a line like "Deployment ID: <uuid>" on success.
    const match = stdout.match(/Deployment ID:\s*([^\s]+)/i);
    if (match?.[1]) return match[1];
    // Fallback: return the whole trimmed stdout so callers can see something.
    return stdout.trim() || 'unknown';
  }

  private async request<T>(
    method: 'GET' | 'POST',
    path: string,
    token: string,
    body: unknown
  ): Promise<T> {
    const res = await this.fetchFn(`${CLOUDFLARE_API_BASE}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const envelope = (await res.json()) as CloudflareEnvelope<T>;
    if (!res.ok || !envelope.success) {
      throw new CloudflareApiError(
        envelope.errors?.[0]?.message ?? `Cloudflare API ${method} ${path} failed`,
        res.status,
        envelope.errors ?? []
      );
    }
    return envelope.result;
  }
}

function mapStageToStatus(
  stage: CloudflarePagesDeployment['latest_stage'] extends infer S
    ? S extends { status: infer K }
      ? K
      : undefined
    : undefined
): CloudDeploymentStatus {
  switch (stage) {
    case 'success':
      return CloudDeploymentStatus.Deployed;
    case 'failure':
    case 'canceled':
      return CloudDeploymentStatus.Failed;
    case 'active':
    case 'idle':
    case 'skipped':
      return CloudDeploymentStatus.Deploying;
    default:
      return CloudDeploymentStatus.Uploading;
  }
}
