/**
 * GitHub Webhook Service
 *
 * Manages GitHub webhook registration and incoming event processing.
 * Uses the GitHub CLI (`gh api`) for webhook CRUD operations.
 *
 * Webhook events supplement the existing PR sync polling:
 * - Webhooks provide near-instant event delivery
 * - Polling remains as a fallback for missed events
 *
 * Registered events: pull_request, check_suite, check_run
 */

import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import type {
  IWebhookService,
  WebhookEvent,
  WebhookValidationResult,
} from '../../../application/ports/output/services/webhook-service.interface.js';
import type { IFeatureRepository } from '../../../application/ports/output/repositories/feature-repository.interface.js';
import type { IGitPrService } from '../../../application/ports/output/services/git-pr-service.interface.js';
import type { INotificationService } from '../../../application/ports/output/services/notification-service.interface.js';
import { SdlcLifecycle, PrStatus, CiStatus } from '../../../domain/generated/output.js';
import { NotificationEventType, NotificationSeverity } from '../../../domain/generated/output.js';
import type { NotificationEvent, Feature } from '../../../domain/generated/output.js';

const TAG = '[GitHubWebhook]';
const WEBHOOK_EVENTS = ['pull_request', 'check_suite', 'check_run'] as const;
const MAX_EVENT_HISTORY = 200;

function normalizePath(p: string): string {
  return p.replace(/\\/g, '/');
}

export type ExecFunction = (
  file: string,
  args: string[],
  options?: object
) => Promise<{ stdout: string; stderr: string }>;

export interface RegisteredWebhook {
  repoFullName: string;
  webhookId: number;
  repositoryPath: string;
}

export type WebhookDeliveryStatus = 'success' | 'ignored' | 'error';

export interface WebhookDeliveryRecord {
  deliveryId: string;
  eventType: string;
  source: string;
  receivedAt: string;
  status: WebhookDeliveryStatus;
  statusMessage: string;
  durationMs: number;
  payload: Record<string, unknown>;
}

export class GitHubWebhookService implements IWebhookService {
  private readonly featureRepo: IFeatureRepository;
  private readonly gitPrService: IGitPrService;
  private readonly notificationService: INotificationService;
  private readonly execFn: ExecFunction;
  private readonly registeredWebhooks: RegisteredWebhook[] = [];
  private readonly deliveryHistory: WebhookDeliveryRecord[] = [];
  private webhookSecret: string;

  constructor(
    featureRepo: IFeatureRepository,
    gitPrService: IGitPrService,
    notificationService: INotificationService,
    execFn: ExecFunction
  ) {
    this.featureRepo = featureRepo;
    this.gitPrService = gitPrService;
    this.notificationService = notificationService;
    this.execFn = execFn;
    this.webhookSecret = randomBytes(32).toString('hex');
  }

  /**
   * Get the webhook secret for signature validation.
   * Exposed so the API route can validate incoming requests.
   */
  getSecret(): string {
    return this.webhookSecret;
  }

  /**
   * Get the list of registered webhooks (for dashboard display).
   */
  getRegisteredWebhooks(): readonly RegisteredWebhook[] {
    return this.registeredWebhooks;
  }

  /**
   * Get recent delivery history (newest first).
   */
  getDeliveryHistory(): readonly WebhookDeliveryRecord[] {
    return this.deliveryHistory;
  }

  /**
   * Register a webhook for a single repository.
   * No-ops if the repo already has a registered webhook (normalized path comparison).
   */
  async registerWebhookForSingleRepo(
    repoPath: string,
    webhookUrl: string
  ): Promise<RegisteredWebhook | null> {
    const normalized = normalizePath(repoPath);
    const existing = this.registeredWebhooks.find(
      (w) => normalizePath(w.repositoryPath) === normalized
    );
    if (existing) return existing;

    await this.registerWebhookForRepo(repoPath, webhookUrl);

    const added = this.registeredWebhooks.find(
      (w) => normalizePath(w.repositoryPath) === normalized
    );
    return added ?? null;
  }

  /**
   * Remove the webhook for a single repository.
   * No-ops if the repo has no registered webhook.
   */
  async removeWebhookForRepo(repoPath: string): Promise<void> {
    const normalized = normalizePath(repoPath);
    const index = this.registeredWebhooks.findIndex(
      (w) => normalizePath(w.repositoryPath) === normalized
    );
    if (index === -1) return;

    const webhook = this.registeredWebhooks[index];

    try {
      await this.execFn(
        'gh',
        [
          'api',
          '--method',
          'DELETE',
          `-H`,
          'Accept: application/vnd.github+json',
          `/repos/${webhook.repoFullName}/hooks/${webhook.webhookId}`,
        ],
        { cwd: webhook.repositoryPath }
      );
      // eslint-disable-next-line no-console
      console.log(`${TAG} Removed webhook #${webhook.webhookId} for ${webhook.repoFullName}`);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      // eslint-disable-next-line no-console
      console.warn(`${TAG} Failed to remove webhook for ${webhook.repoFullName}: ${msg}`);
    }

    this.registeredWebhooks.splice(index, 1);
  }

  async registerWebhooks(publicUrl: string): Promise<void> {
    const webhookUrl = `${publicUrl}/api/webhooks/github`;

    // Find all repos with features in Review lifecycle
    const features = await this.featureRepo.list({ lifecycle: SdlcLifecycle.Review });
    const repoPaths = new Set<string>();
    for (const feature of features) {
      if (feature.repositoryPath) {
        repoPaths.add(feature.repositoryPath);
      }
    }

    for (const repoPath of repoPaths) {
      await this.registerWebhookForRepo(repoPath, webhookUrl);
    }

    // eslint-disable-next-line no-console
    console.log(`${TAG} Registered webhooks for ${this.registeredWebhooks.length} repositories`);
  }

  async updateWebhookUrl(newUrl: string): Promise<void> {
    const webhookUrl = `${newUrl}/api/webhooks/github`;

    for (const webhook of this.registeredWebhooks) {
      try {
        await this.execFn(
          'gh',
          [
            'api',
            '--method',
            'PATCH',
            `-H`,
            'Accept: application/vnd.github+json',
            `/repos/${webhook.repoFullName}/hooks/${webhook.webhookId}`,
            '-f',
            `config[url]=${webhookUrl}`,
            '-f',
            `config[content_type]=json`,
            '-f',
            `config[secret]=${this.webhookSecret}`,
          ],
          { cwd: webhook.repositoryPath }
        );

        // eslint-disable-next-line no-console
        console.log(`${TAG} Updated webhook URL for ${webhook.repoFullName}`);
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        // eslint-disable-next-line no-console
        console.warn(`${TAG} Failed to update webhook for ${webhook.repoFullName}: ${msg}`);
      }
    }
  }

  async removeWebhooks(): Promise<void> {
    for (const webhook of this.registeredWebhooks) {
      try {
        await this.execFn(
          'gh',
          [
            'api',
            '--method',
            'DELETE',
            `-H`,
            'Accept: application/vnd.github+json',
            `/repos/${webhook.repoFullName}/hooks/${webhook.webhookId}`,
          ],
          { cwd: webhook.repositoryPath }
        );

        // eslint-disable-next-line no-console
        console.log(`${TAG} Removed webhook for ${webhook.repoFullName}`);
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        // eslint-disable-next-line no-console
        console.warn(`${TAG} Failed to remove webhook for ${webhook.repoFullName}: ${msg}`);
      }
    }

    this.registeredWebhooks.length = 0;
  }

  validateSignature(payload: string, signature: string, secret: string): WebhookValidationResult {
    if (!signature) {
      return { valid: false, error: 'Missing signature header' };
    }

    const parts = signature.split('=');
    if (parts.length !== 2 || parts[0] !== 'sha256') {
      return { valid: false, error: 'Invalid signature format (expected sha256=...)' };
    }

    const expected = createHmac('sha256', secret).update(payload).digest('hex');
    const actual = parts[1];

    // Use timing-safe comparison to prevent timing attacks
    try {
      const expectedBuf = Buffer.from(expected, 'hex');
      const actualBuf = Buffer.from(actual, 'hex');

      if (expectedBuf.length !== actualBuf.length) {
        return { valid: false, error: 'Signature length mismatch' };
      }

      if (!timingSafeEqual(expectedBuf, actualBuf)) {
        return { valid: false, error: 'Signature mismatch' };
      }

      return { valid: true };
    } catch {
      return { valid: false, error: 'Invalid signature encoding' };
    }
  }

  async handleEvent(event: WebhookEvent): Promise<void> {
    const startTime = Date.now();
    // eslint-disable-next-line no-console
    console.log(
      `${TAG} Received ${event.source}/${event.eventType} (delivery: ${event.deliveryId})`
    );

    let status: WebhookDeliveryStatus = 'success';
    let statusMessage = 'Processed successfully';

    try {
      switch (event.eventType) {
        case 'pull_request':
          await this.handlePullRequestEvent(event.payload);
          break;
        case 'check_suite':
          await this.handleCheckSuiteEvent(event.payload);
          break;
        case 'check_run':
          await this.handleCheckRunEvent(event.payload);
          break;
        default:
          status = 'ignored';
          statusMessage = `Unhandled event type: ${event.eventType}`;
          // eslint-disable-next-line no-console
          console.log(`${TAG} Ignoring unhandled event type: ${event.eventType}`);
      }
    } catch (error) {
      status = 'error';
      statusMessage = error instanceof Error ? error.message : String(error);
    }

    this.recordDelivery({
      deliveryId: event.deliveryId,
      eventType: event.eventType,
      source: event.source,
      receivedAt: new Date().toISOString(),
      status,
      statusMessage,
      durationMs: Date.now() - startTime,
      payload: event.payload,
    });
  }

  private recordDelivery(record: WebhookDeliveryRecord): void {
    this.deliveryHistory.unshift(record);
    if (this.deliveryHistory.length > MAX_EVENT_HISTORY) {
      this.deliveryHistory.length = MAX_EVENT_HISTORY;
    }
  }

  private async handlePullRequestEvent(payload: Record<string, unknown>): Promise<void> {
    const action = payload.action as string;
    const pr = payload.pull_request as Record<string, unknown> | undefined;
    if (!pr) return;

    const prNumber = pr.number as number;
    const prUrl = (pr.html_url as string) ?? '';
    const headBranch = (pr.head as Record<string, unknown>)?.ref as string;

    // Find feature by PR number or branch
    const feature = await this.findFeatureByPrOrBranch(prNumber, headBranch);
    if (!feature) return;

    if (action === 'closed' && pr.merged === true) {
      await this.updateFeaturePrStatus(feature, PrStatus.Merged, prNumber, prUrl);
    } else if (action === 'closed') {
      await this.updateFeaturePrStatus(feature, PrStatus.Closed, prNumber, prUrl);
    } else if (action === 'reopened') {
      await this.updateFeaturePrStatus(feature, PrStatus.Open, prNumber, prUrl);
    }
  }

  private async handleCheckSuiteEvent(payload: Record<string, unknown>): Promise<void> {
    const action = payload.action as string;
    if (action !== 'completed') return;

    const checkSuite = payload.check_suite as Record<string, unknown> | undefined;
    if (!checkSuite) return;

    const conclusion = checkSuite.conclusion as string;
    const headBranch = checkSuite.head_branch as string;

    const feature = await this.findFeatureByBranch(headBranch);
    if (!feature) return;

    const ciStatus = conclusion === 'success' ? CiStatus.Success : CiStatus.Failure;
    await this.updateFeatureCiStatus(feature, ciStatus);
  }

  private async handleCheckRunEvent(payload: Record<string, unknown>): Promise<void> {
    const action = payload.action as string;
    if (action !== 'completed') return;

    const checkRun = payload.check_run as Record<string, unknown> | undefined;
    if (!checkRun) return;

    const conclusion = checkRun.conclusion as string;
    const checkSuite = checkRun.check_suite as Record<string, unknown> | undefined;
    const headBranch = checkSuite?.head_branch as string | undefined;

    if (!headBranch) return;

    const feature = await this.findFeatureByBranch(headBranch);
    if (!feature) return;

    const ciStatus = conclusion === 'success' ? CiStatus.Success : CiStatus.Failure;
    await this.updateFeatureCiStatus(feature, ciStatus);
  }

  private async findFeatureByPrOrBranch(prNumber: number, branch: string): Promise<Feature | null> {
    const features = await this.featureRepo.list({ lifecycle: SdlcLifecycle.Review });

    // Try matching by PR number first
    const byPr = features.find((f) => f.pr?.number === prNumber);
    if (byPr) return byPr;

    // Fall back to branch matching
    return features.find((f) => f.branch === branch) ?? null;
  }

  private async findFeatureByBranch(branch: string): Promise<Feature | null> {
    const features = await this.featureRepo.list({ lifecycle: SdlcLifecycle.Review });
    return features.find((f) => f.branch === branch) ?? null;
  }

  private async updateFeaturePrStatus(
    feature: Feature,
    status: PrStatus,
    prNumber: number,
    prUrl: string
  ): Promise<void> {
    const oldStatus = feature.pr?.status;
    if (oldStatus === status) return;

    feature.pr = { ...feature.pr!, status, url: prUrl, number: prNumber };

    if (status === PrStatus.Merged) {
      feature.lifecycle = SdlcLifecycle.Maintain;
    }

    await this.featureRepo.update(feature);

    // Emit notification
    const eventType =
      status === PrStatus.Merged
        ? NotificationEventType.PrMerged
        : status === PrStatus.Closed
          ? NotificationEventType.PrClosed
          : NotificationEventType.PrChecksPassed; // reopened

    const severity =
      status === PrStatus.Merged
        ? NotificationSeverity.Success
        : status === PrStatus.Closed
          ? NotificationSeverity.Warning
          : NotificationSeverity.Info;

    const event: NotificationEvent = {
      eventType,
      featureId: feature.id,
      agentRunId: feature.agentRunId ?? '',
      featureName: feature.name,
      message: `PR #${prNumber} ${status.toLowerCase()} for ${feature.name} (via webhook)`,
      severity,
      timestamp: new Date().toISOString(),
    };

    this.notificationService.notify(event);
  }

  private async updateFeatureCiStatus(feature: Feature, ciStatus: CiStatus): Promise<void> {
    if (!feature.pr) return;
    if (feature.pr.ciStatus === ciStatus) return;

    feature.pr = { ...feature.pr, ciStatus };
    await this.featureRepo.update(feature);

    const eventType =
      ciStatus === CiStatus.Success
        ? NotificationEventType.PrChecksPassed
        : NotificationEventType.PrChecksFailed;

    const severity =
      ciStatus === CiStatus.Success ? NotificationSeverity.Success : NotificationSeverity.Error;

    const event: NotificationEvent = {
      eventType,
      featureId: feature.id,
      agentRunId: feature.agentRunId ?? '',
      featureName: feature.name,
      message: `CI ${ciStatus === CiStatus.Success ? 'passed' : 'failed'} for ${feature.name} (via webhook)`,
      severity,
      timestamp: new Date().toISOString(),
    };

    this.notificationService.notify(event);
  }

  private async registerWebhookForRepo(repoPath: string, webhookUrl: string): Promise<void> {
    try {
      // Get the repo full name (owner/repo) from the remote URL
      const repoFullName = await this.getRepoFullName(repoPath);
      if (!repoFullName) {
        // eslint-disable-next-line no-console
        console.warn(`${TAG} Could not determine repo name for ${repoPath}`);
        return;
      }

      // Clean up any stale webhooks from previous sessions before creating a new one.
      // Without this, old webhooks remain on GitHub with an outdated secret, causing
      // signature mismatches when GitHub delivers events signed with the old secret.
      await this.removeStaleWebhooks(repoFullName, repoPath);

      // Create webhook via GitHub API
      const { stdout } = await this.execFn(
        'gh',
        [
          'api',
          '--method',
          'POST',
          `-H`,
          'Accept: application/vnd.github+json',
          `/repos/${repoFullName}/hooks`,
          '-f',
          'name=web',
          '-f',
          `config[url]=${webhookUrl}`,
          '-f',
          'config[content_type]=json',
          '-f',
          `config[secret]=${this.webhookSecret}`,
          ...WEBHOOK_EVENTS.flatMap((e) => ['-f', `events[]=${e}`]),
          '-F',
          'active=true',
        ],
        { cwd: repoPath }
      );

      const response = JSON.parse(stdout);
      const webhookId = response.id as number;

      this.registeredWebhooks.push({
        repoFullName,
        webhookId,
        repositoryPath: repoPath,
      });

      // eslint-disable-next-line no-console
      console.log(`${TAG} Registered webhook #${webhookId} for ${repoFullName}`);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      // eslint-disable-next-line no-console
      console.warn(`${TAG} Failed to register webhook for ${repoPath}: ${msg}`);
    }
  }

  /**
   * Remove stale webhooks from a previous session that point to our webhook path.
   * Lists all hooks on the repo and deletes any whose URL ends with /api/webhooks/github.
   */
  private async removeStaleWebhooks(repoFullName: string, repoPath: string): Promise<void> {
    try {
      const { stdout } = await this.execFn(
        'gh',
        ['api', `-H`, 'Accept: application/vnd.github+json', `/repos/${repoFullName}/hooks`],
        { cwd: repoPath }
      );

      const hooks = JSON.parse(stdout) as {
        id: number;
        config?: { url?: string };
      }[];

      for (const hook of hooks) {
        const hookUrl = hook.config?.url ?? '';
        if (hookUrl.endsWith('/api/webhooks/github')) {
          try {
            await this.execFn(
              'gh',
              [
                'api',
                '--method',
                'DELETE',
                `-H`,
                'Accept: application/vnd.github+json',
                `/repos/${repoFullName}/hooks/${hook.id}`,
              ],
              { cwd: repoPath }
            );
            // eslint-disable-next-line no-console
            console.log(`${TAG} Removed stale webhook #${hook.id} from ${repoFullName}`);
          } catch (deleteError) {
            const msg = deleteError instanceof Error ? deleteError.message : String(deleteError);
            // eslint-disable-next-line no-console
            console.warn(`${TAG} Failed to remove stale webhook #${hook.id}: ${msg}`);
          }
        }
      }
    } catch {
      // If listing fails (e.g. permissions), proceed with creating a new webhook anyway
    }
  }

  private async getRepoFullName(repoPath: string): Promise<string | null> {
    try {
      const remoteUrl = await this.gitPrService.getRemoteUrl(repoPath);
      if (!remoteUrl) return null;

      // Parse owner/repo from URL
      // Handles both https://github.com/owner/repo and git@github.com:owner/repo.git
      const match = remoteUrl.match(/github\.com[/:]([\w.-]+)\/([\w.-]+?)(?:\.git)?$/);
      if (!match) return null;

      return `${match[1]}/${match[2]}`;
    } catch {
      return null;
    }
  }
}
