/**
 * Webhook Manager Service
 *
 * Orchestrates the Cloudflare Tunnel and GitHub Webhook lifecycle.
 * Follows the singleton pattern used by NotificationWatcherService
 * and PrSyncWatcherService.
 *
 * Lifecycle:
 * 1. Start Cloudflare Tunnel to get a public URL
 * 2. Register GitHub webhooks pointing to the tunnel URL
 * 3. Monitor for tunnel URL changes → update webhooks
 * 4. On shutdown → remove webhooks → stop tunnel
 *
 * The manager is optional — if cloudflared is not installed or webhook
 * registration fails, the system falls back to polling gracefully.
 */

import type { ITunnelService } from '../../../application/ports/output/services/tunnel-service.interface.js';
import type { IWebhookService } from '../../../application/ports/output/services/webhook-service.interface.js';
import type {
  RegisteredWebhook,
  WebhookDeliveryRecord,
  GitHubWebhookService,
} from './github-webhook.service.js';

const SUBSCRIBED_EVENTS = ['pull_request', 'check_suite', 'check_run'] as const;

export interface WebhookSystemStatus {
  running: boolean;
  tunnel: {
    connected: boolean;
    publicUrl: string | null;
  };
  webhooks: {
    registered: readonly RegisteredWebhook[];
    subscribedEvents: readonly string[];
    totalDeliveries: number;
    successCount: number;
    errorCount: number;
    ignoredCount: number;
  };
  startedAt: string | null;
}

function normalizePath(p: string): string {
  return p.replace(/\\/g, '/');
}

export interface WebhookRepoResult {
  success: boolean;
  webhook?: RegisteredWebhook;
  error?: string;
}

const TAG = '[WebhookManager]';

export class WebhookManagerService {
  private readonly tunnelService: ITunnelService;
  private readonly webhookService: IWebhookService;
  private running = false;
  private startedAt: string | null = null;

  constructor(tunnelService: ITunnelService, webhookService: IWebhookService) {
    this.tunnelService = tunnelService;
    this.webhookService = webhookService;
  }

  /**
   * Start the tunnel and register webhooks.
   * Fails gracefully — logs warnings but does not throw.
   *
   * @param localPort - The local web server port to tunnel
   */
  async start(localPort: number): Promise<void> {
    if (this.running) return;

    try {
      // Step 1: Start the tunnel
      // eslint-disable-next-line no-console
      console.log(`${TAG} Starting Cloudflare Tunnel for port ${localPort}...`);
      const publicUrl = await this.tunnelService.start(localPort);

      // Step 2: Listen for URL changes
      this.tunnelService.onUrlChange(async (newUrl) => {
        // eslint-disable-next-line no-console
        console.log(`${TAG} Tunnel URL changed, updating webhooks...`);
        try {
          await this.webhookService.updateWebhookUrl(newUrl);
        } catch (error) {
          const msg = error instanceof Error ? error.message : String(error);
          // eslint-disable-next-line no-console
          console.warn(`${TAG} Failed to update webhooks after URL change: ${msg}`);
        }
      });

      // Step 3: Register webhooks with external services
      await this.webhookService.registerWebhooks(publicUrl);

      this.running = true;
      this.startedAt = new Date().toISOString();
      // eslint-disable-next-line no-console
      console.log(`${TAG} Webhook system ready (tunnel: ${publicUrl})`);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      // eslint-disable-next-line no-console
      console.warn(`${TAG} Failed to start webhook system (falling back to polling): ${msg}`);

      // Clean up partial state
      try {
        await this.tunnelService.stop();
      } catch {
        // Already stopped or never started
      }
    }
  }

  /**
   * Stop the webhook system — remove webhooks, then stop the tunnel.
   */
  async stop(): Promise<void> {
    if (!this.running) return;

    // eslint-disable-next-line no-console
    console.log(`${TAG} Shutting down webhook system...`);

    try {
      await this.webhookService.removeWebhooks();
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      // eslint-disable-next-line no-console
      console.warn(`${TAG} Failed to remove webhooks during shutdown: ${msg}`);
    }

    try {
      await this.tunnelService.stop();
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      // eslint-disable-next-line no-console
      console.warn(`${TAG} Failed to stop tunnel during shutdown: ${msg}`);
    }

    this.running = false;
    // eslint-disable-next-line no-console
    console.log(`${TAG} Webhook system stopped`);
  }

  async enableWebhookForRepo(repoPath: string): Promise<WebhookRepoResult> {
    if (!this.tunnelService.isRunning() || !this.tunnelService.getPublicUrl()) {
      return { success: false, error: 'tunnel_not_connected' };
    }

    const webhookUrl = `${this.tunnelService.getPublicUrl()}/api/webhooks/github`;
    const ghService = this.webhookService as GitHubWebhookService;

    try {
      const webhook = await ghService.registerWebhookForSingleRepo(repoPath, webhookUrl);
      return { success: true, webhook: webhook ?? undefined };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return { success: false, error: msg };
    }
  }

  async disableWebhookForRepo(repoPath: string): Promise<{ success: boolean; error?: string }> {
    const ghService = this.webhookService as GitHubWebhookService;

    try {
      await ghService.removeWebhookForRepo(repoPath);
      return { success: true };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return { success: false, error: msg };
    }
  }

  isWebhookEnabledForRepo(repoPath: string): boolean {
    return this.getWebhookForRepo(repoPath) !== undefined;
  }

  getWebhookForRepo(repoPath: string): RegisteredWebhook | undefined {
    const ghService = this.webhookService as GitHubWebhookService;
    const registered =
      typeof ghService.getRegisteredWebhooks === 'function'
        ? ghService.getRegisteredWebhooks()
        : [];
    const normalized = normalizePath(repoPath);
    return registered.find((w) => normalizePath(w.repositoryPath) === normalized);
  }

  isRunning(): boolean {
    return this.running;
  }

  getTunnelUrl(): string | null {
    return this.tunnelService.getPublicUrl();
  }

  getStatus(): WebhookSystemStatus {
    const ghService = this.webhookService as GitHubWebhookService;
    const deliveries =
      typeof ghService.getDeliveryHistory === 'function' ? ghService.getDeliveryHistory() : [];

    const registered =
      typeof ghService.getRegisteredWebhooks === 'function'
        ? ghService.getRegisteredWebhooks()
        : [];

    let successCount = 0;
    let errorCount = 0;
    let ignoredCount = 0;
    for (const d of deliveries) {
      if (d.status === 'success') successCount++;
      else if (d.status === 'error') errorCount++;
      else ignoredCount++;
    }

    return {
      running: this.running,
      tunnel: {
        connected: this.tunnelService.isRunning(),
        publicUrl: this.tunnelService.getPublicUrl(),
      },
      webhooks: {
        registered,
        subscribedEvents: SUBSCRIBED_EVENTS,
        totalDeliveries: deliveries.length,
        successCount,
        errorCount,
        ignoredCount,
      },
      startedAt: this.startedAt,
    };
  }

  getDeliveryHistory(): readonly WebhookDeliveryRecord[] {
    const ghService = this.webhookService as GitHubWebhookService;
    if (typeof ghService.getDeliveryHistory === 'function') {
      return ghService.getDeliveryHistory();
    }
    return [];
  }
}

// --- Singleton accessors ---
//
// The singleton is stored on globalThis so that it survives module duplication
// across bundler contexts (e.g. Next.js Turbopack bundles API routes separately
// from the dev-server entry point, giving each its own copy of module-level
// variables). By using globalThis, the same manager instance is visible to both
// the initializer (dev-server.ts / CLI) and the API route handlers.

const GLOBAL_KEY = '__shepWebhookManager' as const;

function getInstance(): WebhookManagerService | null {
  return ((globalThis as Record<string, unknown>)[GLOBAL_KEY] as WebhookManagerService) ?? null;
}

function setInstance(instance: WebhookManagerService | null): void {
  (globalThis as Record<string, unknown>)[GLOBAL_KEY] = instance;
}

/**
 * Initialize the webhook manager singleton.
 * Must be called once during web server startup.
 *
 * @throws Error if the manager is already initialized
 */
export function initializeWebhookManager(
  tunnelService: ITunnelService,
  webhookService: IWebhookService
): void {
  if (getInstance() !== null) {
    throw new Error('Webhook manager already initialized. Cannot re-initialize.');
  }

  setInstance(new WebhookManagerService(tunnelService, webhookService));
}

/**
 * Get the webhook manager singleton.
 *
 * @returns The webhook manager service
 * @throws Error if the manager hasn't been initialized yet
 */
export function getWebhookManager(): WebhookManagerService {
  const instance = getInstance();
  if (instance === null) {
    throw new Error(
      'Webhook manager not initialized. Call initializeWebhookManager() during web server startup.'
    );
  }

  return instance;
}

/**
 * Check if the webhook manager has been initialized.
 */
export function hasWebhookManager(): boolean {
  return getInstance() !== null;
}

/**
 * Reset the webhook manager singleton (for testing purposes only).
 * Stops the manager if running before resetting.
 *
 * @internal
 */
export function resetWebhookManager(): void {
  const instance = getInstance();
  if (instance !== null) {
    void instance.stop();
  }
  setInstance(null);
}
