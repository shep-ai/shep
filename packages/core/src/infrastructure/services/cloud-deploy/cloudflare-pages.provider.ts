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
import type {
  CloudDeployInput,
  CloudDeployLogEmitter,
  CloudDeployProgressHandler,
  CloudDeployResult,
  ICloudDeploymentProvider,
} from '../../../application/ports/output/services/cloud-deployment-provider.interface.js';
import { CloudProviderNotConnectedError } from '../../../domain/errors/cloud-provider-not-connected.error.js';
import {
  CloudDeploymentProvider,
  CloudDeploymentStatus,
  OperationLogLevel,
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
    onProgress: CloudDeployProgressHandler,
    onLog?: CloudDeployLogEmitter
  ): Promise<CloudDeployResult> {
    const log: CloudDeployLogEmitter = onLog ?? (() => undefined);
    log(OperationLogLevel.Info, `Starting Cloudflare Pages deploy for "${input.projectName}"`);

    const token = await this.tokens.get(CloudDeploymentProvider.CloudflarePages);
    if (!token) {
      log(OperationLogLevel.Error, 'No Cloudflare token stored for this provider');
      throw new CloudProviderNotConnectedError(this.providerId);
    }
    log(OperationLogLevel.Debug, 'Decrypted Cloudflare token from local store');

    const accountId = await this.discoverAccountId(token, log);
    log(OperationLogLevel.Info, `Using Cloudflare account ${accountId}`);

    await this.ensureProject(token, accountId, input.projectName, log);

    onProgress(CloudDeploymentStatus.Uploading, 'Uploading build output to Cloudflare Pages');
    log(OperationLogLevel.Info, `Running wrangler pages deploy from ${input.buildOutputDir}`);
    const wranglerResult = await this.runWranglerDeploy(
      token,
      accountId,
      input.projectName,
      input.buildOutputDir,
      log
    );

    // Success path A (modern wrangler 4.x+): stdout contained a live URL.
    // Wrangler has ALREADY confirmed the deploy is live, so we skip polling
    // entirely — the previous version of this code treated the URL banner
    // as a deployment id, URL-encoded it into a GET, and got a 403 HTML
    // page back, which produced a false-negative "Deploy failed" even
    // though Cloudflare had actually succeeded.
    if (wranglerResult.url) {
      log(OperationLogLevel.Info, 'Wrangler reported deploy complete — skipping Cloudflare poll');
      onProgress(CloudDeploymentStatus.Deploying, 'Cloudflare is finalising the deployment');
      // Look up the real deployment id via a single API call so the
      // Application row carries a re-hydratable id (not a synthetic stub).
      // If this lookup fails for any reason we still return success — the
      // authoritative signal is wrangler's exit code + URL banner.
      let newestId: string | null = null;
      try {
        const newest = await this.fetchNewestDeployment(token, accountId, input.projectName);
        newestId = newest?.id ?? null;
        if (newestId) {
          log(OperationLogLevel.Debug, `Resolved wrangler URL to deployment id ${newestId}`);
        }
      } catch (err) {
        log(
          OperationLogLevel.Warn,
          'Failed to look up deployment id after wrangler success — using URL-derived fallback',
          err instanceof Error ? err.message : String(err)
        );
      }
      onProgress(CloudDeploymentStatus.Deployed, `Live at ${wranglerResult.url}`);
      log(OperationLogLevel.Info, `Deployment succeeded — live at ${wranglerResult.url}`);
      return {
        deploymentId: newestId ?? `wrangler-${Date.now()}`,
        url: wranglerResult.url,
      };
    }

    // Success path B (legacy wrangler): stdout contained a bare deployment
    // id. Fall back to the old polling flow.
    if (wranglerResult.deploymentId) {
      log(
        OperationLogLevel.Info,
        `Wrangler returned legacy deployment id ${wranglerResult.deploymentId}`
      );
      onProgress(CloudDeploymentStatus.Deploying, 'Cloudflare is finalising the deployment');
      const result = await this.pollUntilFinished(
        token,
        accountId,
        input.projectName,
        wranglerResult.deploymentId,
        log
      );
      onProgress(CloudDeploymentStatus.Deployed, `Live at ${result.url}`);
      log(OperationLogLevel.Info, `Deployment succeeded — live at ${result.url ?? '<unknown>'}`);
      return { deploymentId: result.id, url: result.url ?? '' };
    }

    // Neither signal parsed — wrangler changed its output yet again.
    log(
      OperationLogLevel.Error,
      'Wrangler succeeded (exit 0) but neither a URL nor a deployment id could be parsed from its output'
    );
    throw new CloudflareApiError('Could not parse wrangler output for deployment id or URL', 0, []);
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

  private async discoverAccountId(token: string, log?: CloudDeployLogEmitter): Promise<string> {
    const accounts = await this.request<CloudflareAccount[]>('GET', '/accounts', token, undefined);
    const first = accounts[0];
    if (!first) {
      log?.(OperationLogLevel.Error, 'Cloudflare returned 0 accounts for this token');
      throw new CloudflareAccountMissingError();
    }
    log?.(
      OperationLogLevel.Debug,
      `Cloudflare /accounts returned ${accounts.length} account(s); using "${first.name}" (${first.id})`
    );
    return first.id;
  }

  private async ensureProject(
    token: string,
    accountId: string,
    name: string,
    log?: CloudDeployLogEmitter
  ): Promise<void> {
    const projects = await this.listProjects(token, accountId);
    if (projects.some((p) => p.name === name)) {
      log?.(
        OperationLogLevel.Info,
        `Reusing existing Cloudflare Pages project "${name}" (no new project created)`
      );
      return;
    }
    log?.(
      OperationLogLevel.Info,
      `No existing project named "${name}" — creating one on Cloudflare Pages`
    );
    try {
      await this.request<CloudflarePagesProject>(
        'POST',
        `/accounts/${accountId}/pages/projects`,
        token,
        { name, production_branch: 'main' }
      );
      log?.(OperationLogLevel.Info, `Created Cloudflare Pages project "${name}"`);
    } catch (err) {
      if (err instanceof CloudflareApiError && err.status === 409) {
        log?.(
          OperationLogLevel.Warn,
          `Cloudflare returned 409 (already exists) for project "${name}" — treating as success`
        );
        return;
      }
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
    deploymentId: string,
    log?: CloudDeployLogEmitter
  ): Promise<CloudflarePagesDeployment> {
    const deadline = this.clock.now() + POLL_TIMEOUT_MS;
    let lastStatus: string | undefined;
    while (this.clock.now() < deadline) {
      const dep = await this.getDeployment(token, accountId, projectName, deploymentId);
      const status = dep.latest_stage?.status;
      if (status !== lastStatus) {
        log?.(
          OperationLogLevel.Info,
          `Cloudflare deployment stage transitioned to "${status ?? 'unknown'}"`
        );
        lastStatus = status;
      }
      if (status === 'success') return dep;
      if (status === 'failure' || status === 'canceled') {
        log?.(
          OperationLogLevel.Error,
          `Cloudflare deployment ${status}`,
          JSON.stringify(dep.latest_stage)
        );
        throw new CloudflareApiError(`Cloudflare Pages deployment ${status}`, 0, []);
      }
      await this.clock.sleep(POLL_INTERVAL_MS);
    }
    log?.(OperationLogLevel.Error, `Polling timed out after ${POLL_TIMEOUT_MS}ms`);
    throw new CloudflareApiError('Cloudflare Pages deployment polling timed out', 0);
  }

  /**
   * Result of a wrangler subprocess invocation. Modern wrangler (4.x+)
   * prints a URL banner on success but NO explicit "Deployment ID:" line,
   * so we return whichever signals we could parse. The caller decides
   * whether to skip polling based on which fields are populated.
   */
  private async runWranglerDeploy(
    token: string,
    accountId: string,
    projectName: string,
    buildDir: string,
    log?: CloudDeployLogEmitter
  ): Promise<{ deploymentId: string | null; url: string | null }> {
    const { stdout, stderr } = await this.execFile(
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
    // Capture both streams as a multi-line detail so the UI can show a
    // collapsible "wrangler output" entry. Tail the last 50 lines so we
    // don't blow up the row size for huge outputs.
    const tail = (text: string): string => text.split(/\r?\n/).slice(-50).join('\n');
    const combined = [
      stdout && `--- stdout (last 50) ---\n${tail(stdout)}`,
      stderr && `--- stderr (last 50) ---\n${tail(stderr)}`,
    ]
      .filter(Boolean)
      .join('\n');
    log?.(OperationLogLevel.Debug, 'wrangler pages deploy completed', combined || undefined);

    // Modern wrangler (4.x+) success banner contains the live preview URL:
    //   "Deployment complete! Take a peek over at https://<shortid>.<proj>.pages.dev"
    // The URL is the authoritative success signal — if wrangler printed it
    // AND exited 0, the deploy is live. We return the URL so the caller can
    // skip polling entirely; a subsequent API call will look up the real
    // deployment id for status re-hydration.
    const urlMatch = stdout.match(/https:\/\/[a-z0-9]+\.[^\s)"'<>]+\.pages\.dev/i);
    if (urlMatch) {
      return { deploymentId: null, url: urlMatch[0] };
    }

    // Legacy wrangler (pre-4.x) printed "Deployment ID: <uuid>" instead.
    const idMatch = stdout.match(/Deployment ID:\s*([A-Za-z0-9-]+)/i);
    if (idMatch?.[1]) return { deploymentId: idMatch[1], url: null };

    // Neither signal parsed — wrangler changed output again, or the command
    // failed silently. Return nulls so the caller decides how to proceed.
    return { deploymentId: null, url: null };
  }

  /**
   * Fetch the single newest deployment for a project. Used right after a
   * wrangler success banner to look up the real deployment id so we can
   * persist it on the Application row for later status re-hydration.
   */
  private async fetchNewestDeployment(
    token: string,
    accountId: string,
    projectName: string
  ): Promise<CloudflarePagesDeployment | null> {
    const results = await this.request<CloudflarePagesDeployment[]>(
      'GET',
      `/accounts/${accountId}/pages/projects/${projectName}/deployments?per_page=1&page=1`,
      token,
      undefined
    );
    return results[0] ?? null;
  }

  private async request<T>(
    method: 'GET' | 'POST',
    path: string,
    token: string,
    body: unknown
  ): Promise<T> {
    const url = `${CLOUDFLARE_API_BASE}${path}`;
    const res = await this.fetchFn(url, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });

    // Read the body as text first so we can produce a useful error when
    // Cloudflare's edge returns an HTML error page (5xx, captive portal,
    // rate-limit page, etc.). Parsing JSON before checking the response shape
    // would otherwise blow up with `SyntaxError: Unexpected token '<'` and
    // hide the real status from the user.
    const rawText = await res.text().catch(() => '');
    const contentType = res.headers.get('content-type') ?? '';
    const looksLikeJson = contentType.includes('application/json') || rawText.startsWith('{');

    if (!looksLikeJson) {
      throw new CloudflareApiError(
        `Cloudflare API ${method} ${path} returned a non-JSON response (HTTP ${res.status}). ` +
          `First 200 chars: ${snippetForError(rawText)}`,
        res.status,
        []
      );
    }

    let envelope: CloudflareEnvelope<T>;
    try {
      envelope = JSON.parse(rawText) as CloudflareEnvelope<T>;
    } catch {
      throw new CloudflareApiError(
        `Cloudflare API ${method} ${path} returned malformed JSON (HTTP ${res.status}). ` +
          `First 200 chars: ${snippetForError(rawText)}`,
        res.status,
        []
      );
    }

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

function snippetForError(text: string, max = 200): string {
  const collapsed = text.replace(/\s+/g, ' ').trim();
  if (collapsed.length === 0) return '<empty body>';
  if (collapsed.length <= max) return collapsed;
  return `${collapsed.slice(0, max)}…`;
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
