/**
 * Webhook Manager Service Unit Tests
 *
 * Tests for the orchestrator that ties tunnel + webhook lifecycle together.
 *
 * TDD Phase: GREEN
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  WebhookManagerService,
  initializeWebhookManager,
  getWebhookManager,
  hasWebhookManager,
  resetWebhookManager,
} from '@/infrastructure/services/webhook/webhook-manager.service.js';
import type { ITunnelService } from '@/application/ports/output/services/tunnel-service.interface.js';
import type { IWebhookService } from '@/application/ports/output/services/webhook-service.interface.js';

function createMockTunnelService(): ITunnelService {
  return {
    start: vi.fn().mockResolvedValue('https://test.trycloudflare.com'),
    stop: vi.fn().mockResolvedValue(undefined),
    getPublicUrl: vi.fn().mockReturnValue('https://test.trycloudflare.com'),
    onUrlChange: vi.fn(),
    isRunning: vi.fn().mockReturnValue(true),
  };
}

function createMockWebhookService(): IWebhookService {
  return {
    registerWebhooks: vi.fn().mockResolvedValue(undefined),
    updateWebhookUrl: vi.fn().mockResolvedValue(undefined),
    removeWebhooks: vi.fn().mockResolvedValue(undefined),
    validateSignature: vi.fn().mockReturnValue({ valid: true }),
    handleEvent: vi.fn().mockResolvedValue(undefined),
  };
}

describe('WebhookManagerService', () => {
  let tunnelService: ReturnType<typeof createMockTunnelService>;
  let webhookService: ReturnType<typeof createMockWebhookService>;
  let manager: WebhookManagerService;

  beforeEach(() => {
    tunnelService = createMockTunnelService();
    webhookService = createMockWebhookService();
    manager = new WebhookManagerService(tunnelService, webhookService);
  });

  describe('start', () => {
    it('should start tunnel and register webhooks', async () => {
      await manager.start(3000);

      expect(tunnelService.start).toHaveBeenCalledWith(3000);
      expect(tunnelService.onUrlChange).toHaveBeenCalled();
      expect(webhookService.registerWebhooks).toHaveBeenCalledWith(
        'https://test.trycloudflare.com'
      );
      expect(manager.isRunning()).toBe(true);
    });

    it('should register URL change handler that updates webhooks', async () => {
      await manager.start(3000);

      // Get the URL change handler that was registered
      const onUrlChange = vi.mocked(tunnelService.onUrlChange);
      expect(onUrlChange).toHaveBeenCalledTimes(1);
      const handler = onUrlChange.mock.calls[0][0];

      // Simulate URL change
      await handler('https://new-url.trycloudflare.com');

      expect(webhookService.updateWebhookUrl).toHaveBeenCalledWith(
        'https://new-url.trycloudflare.com'
      );
    });

    it('should not throw if tunnel start fails (graceful fallback)', async () => {
      vi.mocked(tunnelService.start).mockRejectedValue(new Error("'cloudflared' not found"));

      // Should not throw
      await expect(manager.start(3000)).resolves.toBeUndefined();
      expect(manager.isRunning()).toBe(false);
    });

    it('should clean up tunnel if webhook registration fails', async () => {
      vi.mocked(webhookService.registerWebhooks).mockRejectedValue(new Error('GitHub API error'));

      await expect(manager.start(3000)).resolves.toBeUndefined();
      expect(tunnelService.stop).toHaveBeenCalled();
      expect(manager.isRunning()).toBe(false);
    });

    it('should be idempotent when already running', async () => {
      await manager.start(3000);
      await manager.start(3000);

      expect(tunnelService.start).toHaveBeenCalledTimes(1);
    });
  });

  describe('stop', () => {
    it('should remove webhooks and stop tunnel', async () => {
      await manager.start(3000);
      await manager.stop();

      expect(webhookService.removeWebhooks).toHaveBeenCalled();
      expect(tunnelService.stop).toHaveBeenCalled();
      expect(manager.isRunning()).toBe(false);
    });

    it('should handle webhook removal failure gracefully', async () => {
      await manager.start(3000);
      vi.mocked(webhookService.removeWebhooks).mockRejectedValue(new Error('API error'));

      await expect(manager.stop()).resolves.toBeUndefined();
      expect(tunnelService.stop).toHaveBeenCalled();
    });

    it('should be safe to call stop when not running', async () => {
      await expect(manager.stop()).resolves.toBeUndefined();
    });
  });

  describe('getTunnelUrl', () => {
    it('should return tunnel URL when running', async () => {
      await manager.start(3000);
      expect(manager.getTunnelUrl()).toBe('https://test.trycloudflare.com');
    });
  });

  describe('getStatus', () => {
    it('should return inactive status when not started', () => {
      const status = manager.getStatus();
      expect(status.running).toBe(false);
      expect(status.startedAt).toBeNull();
    });

    it('should return active status with tunnel info when running', async () => {
      await manager.start(3000);
      const status = manager.getStatus();

      expect(status.running).toBe(true);
      expect(status.startedAt).not.toBeNull();
      expect(status.tunnel.connected).toBe(true);
      expect(status.tunnel.publicUrl).toBe('https://test.trycloudflare.com');
    });

    it('should return delivery statistics', async () => {
      await manager.start(3000);
      const status = manager.getStatus();

      expect(status.webhooks.totalDeliveries).toBe(0);
      expect(status.webhooks.successCount).toBe(0);
      expect(status.webhooks.errorCount).toBe(0);
      expect(status.webhooks.ignoredCount).toBe(0);
    });
  });

  describe('getDeliveryHistory', () => {
    it('should return empty array when webhook service has no delivery tracking', async () => {
      await manager.start(3000);
      const history = manager.getDeliveryHistory();
      expect(history).toEqual([]);
    });
  });
});

describe('Singleton accessors', () => {
  afterEach(() => {
    resetWebhookManager();
  });

  it('should initialize and retrieve singleton', () => {
    const tunnel = createMockTunnelService();
    const webhook = createMockWebhookService();

    expect(hasWebhookManager()).toBe(false);

    initializeWebhookManager(tunnel, webhook);

    expect(hasWebhookManager()).toBe(true);
    expect(getWebhookManager()).toBeInstanceOf(WebhookManagerService);
  });

  it('should throw on double initialization', () => {
    const tunnel = createMockTunnelService();
    const webhook = createMockWebhookService();

    initializeWebhookManager(tunnel, webhook);

    expect(() => initializeWebhookManager(tunnel, webhook)).toThrow('already initialized');
  });

  it('should throw when getting uninitialized manager', () => {
    expect(() => getWebhookManager()).toThrow('not initialized');
  });

  it('should reset cleanly', () => {
    const tunnel = createMockTunnelService();
    const webhook = createMockWebhookService();

    initializeWebhookManager(tunnel, webhook);
    resetWebhookManager();

    expect(hasWebhookManager()).toBe(false);
  });
});

describe('Per-repo webhook methods', () => {
  function createMockWebhookServiceWithSingleRepo() {
    return {
      ...createMockWebhookService(),
      registerWebhookForSingleRepo: vi
        .fn()
        .mockResolvedValue({ repoFullName: 'owner/repo', webhookId: 42, repositoryPath: '/repo' }),
      removeWebhookForRepo: vi.fn().mockResolvedValue(undefined),
      getRegisteredWebhooks: vi.fn().mockReturnValue([]),
      getDeliveryHistory: vi.fn().mockReturnValue([]),
    };
  }

  describe('enableWebhookForRepo', () => {
    it('should return error when tunnel is not running', async () => {
      const tunnel = createMockTunnelService();
      vi.mocked(tunnel.isRunning).mockReturnValue(false);
      vi.mocked(tunnel.getPublicUrl).mockReturnValue(null);
      const webhook = createMockWebhookServiceWithSingleRepo();
      const manager = new WebhookManagerService(tunnel, webhook);

      const result = await manager.enableWebhookForRepo('/repo');
      expect(result).toEqual({ success: false, error: 'tunnel_not_connected' });
      expect(webhook.registerWebhookForSingleRepo).not.toHaveBeenCalled();
    });

    it('should register webhook and return success when tunnel is running', async () => {
      const tunnel = createMockTunnelService();
      const webhook = createMockWebhookServiceWithSingleRepo();
      const manager = new WebhookManagerService(tunnel, webhook);

      const result = await manager.enableWebhookForRepo('/repo');
      expect(result.success).toBe(true);
      expect(result.webhook).toBeDefined();
      expect(webhook.registerWebhookForSingleRepo).toHaveBeenCalledWith(
        '/repo',
        'https://test.trycloudflare.com/api/webhooks/github'
      );
    });

    it('should return error when registration throws', async () => {
      const tunnel = createMockTunnelService();
      const webhook = createMockWebhookServiceWithSingleRepo();
      webhook.registerWebhookForSingleRepo.mockRejectedValue(new Error('gh api failed'));
      const manager = new WebhookManagerService(tunnel, webhook);

      const result = await manager.enableWebhookForRepo('/repo');
      expect(result.success).toBe(false);
      expect(result.error).toBe('gh api failed');
    });
  });

  describe('disableWebhookForRepo', () => {
    it('should delegate to webhookService.removeWebhookForRepo', async () => {
      const tunnel = createMockTunnelService();
      const webhook = createMockWebhookServiceWithSingleRepo();
      const manager = new WebhookManagerService(tunnel, webhook);

      const result = await manager.disableWebhookForRepo('/repo');
      expect(result).toEqual({ success: true });
      expect(webhook.removeWebhookForRepo).toHaveBeenCalledWith('/repo');
    });

    it('should return error when removal throws', async () => {
      const tunnel = createMockTunnelService();
      const webhook = createMockWebhookServiceWithSingleRepo();
      webhook.removeWebhookForRepo.mockRejectedValue(new Error('api error'));
      const manager = new WebhookManagerService(tunnel, webhook);

      const result = await manager.disableWebhookForRepo('/repo');
      expect(result.success).toBe(false);
      expect(result.error).toBe('api error');
    });
  });

  describe('isWebhookEnabledForRepo', () => {
    it('should return false when repo has no webhook', () => {
      const tunnel = createMockTunnelService();
      const webhook = createMockWebhookServiceWithSingleRepo();
      const manager = new WebhookManagerService(tunnel, webhook);

      expect(manager.isWebhookEnabledForRepo('/repo')).toBe(false);
    });

    it('should return true when repo has a webhook (normalized path)', () => {
      const tunnel = createMockTunnelService();
      const webhook = createMockWebhookServiceWithSingleRepo();
      webhook.getRegisteredWebhooks.mockReturnValue([
        { repoFullName: 'owner/repo', webhookId: 42, repositoryPath: '/home/user/repo' },
      ]);
      const manager = new WebhookManagerService(tunnel, webhook);

      expect(manager.isWebhookEnabledForRepo('/home/user/repo')).toBe(true);
      expect(manager.isWebhookEnabledForRepo('\\home\\user\\repo')).toBe(true);
    });
  });
});
