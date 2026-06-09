/**
 * GitHub Webhook Service Unit Tests
 *
 * Tests for signature validation, event handling, and webhook registration.
 *
 * TDD Phase: GREEN
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createHmac } from 'node:crypto';
import { GitHubWebhookService } from '@/infrastructure/services/webhook/github-webhook.service.js';
import { SdlcLifecycle, PrStatus, CiStatus } from '@/domain/generated/output.js';
import type { IFeatureRepository } from '@/application/ports/output/repositories/feature-repository.interface.js';
import type { IGitPrService } from '@/application/ports/output/services/git-pr-service.interface.js';
import type { INotificationService } from '@/application/ports/output/services/notification-service.interface.js';
import type { Feature } from '@/domain/generated/output.js';

function createMockFeature(overrides: Partial<Feature> = {}): Feature {
  return {
    id: 'feat-1',
    name: 'Test Feature',
    slug: 'test-feature',
    description: 'A test feature',
    lifecycle: SdlcLifecycle.Review,
    branch: 'feat/test',
    repositoryPath: '/repo/path',
    pr: {
      url: 'https://github.com/owner/repo/pull/42',
      number: 42,
      status: PrStatus.Open,
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  } as Feature;
}

describe('GitHubWebhookService', () => {
  let service: GitHubWebhookService;
  let mockFeatureRepo: IFeatureRepository;
  let mockGitPrService: IGitPrService;
  let mockNotificationService: INotificationService;

  let mockExecFn: any;

  beforeEach(() => {
    mockFeatureRepo = {
      list: vi.fn().mockResolvedValue([]),
      findById: vi.fn(),
      create: vi.fn(),
      update: vi.fn().mockResolvedValue(undefined),
      delete: vi.fn(),
    } as unknown as IFeatureRepository;

    mockGitPrService = {
      getRemoteUrl: vi.fn().mockResolvedValue('https://github.com/owner/repo'),
      hasRemote: vi.fn().mockResolvedValue(true),
    } as unknown as IGitPrService;

    mockNotificationService = {
      notify: vi.fn(),
    } as unknown as INotificationService;

    mockExecFn = vi.fn().mockResolvedValue({ stdout: '{}', stderr: '' });

    service = new GitHubWebhookService(
      mockFeatureRepo,
      mockGitPrService,
      mockNotificationService,
      mockExecFn
    );
  });

  describe('validateSignature', () => {
    it('should accept valid HMAC-SHA256 signature', () => {
      const secret = service.getSecret();
      const payload = '{"action":"opened"}';
      const hmac = createHmac('sha256', secret).update(payload).digest('hex');
      const signature = `sha256=${hmac}`;

      const result = service.validateSignature(payload, signature, secret);
      expect(result.valid).toBe(true);
    });

    it('should reject missing signature', () => {
      const result = service.validateSignature('payload', '', 'secret');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Missing signature');
    });

    it('should reject invalid signature format', () => {
      const result = service.validateSignature('payload', 'md5=abc', 'secret');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Invalid signature format');
    });

    it('should reject wrong signature value', () => {
      const result = service.validateSignature(
        'payload',
        'sha256=0000000000000000000000000000000000000000000000000000000000000000',
        'secret'
      );
      expect(result.valid).toBe(false);
      expect(result.error).toContain('mismatch');
    });

    it('should reject invalid hex encoding', () => {
      const result = service.validateSignature('payload', 'sha256=notvalidhex', 'secret');
      expect(result.valid).toBe(false);
    });
  });

  describe('handleEvent — pull_request', () => {
    it('should update feature when PR is merged', async () => {
      const feature = createMockFeature();
      vi.mocked(mockFeatureRepo.list).mockResolvedValue([feature]);

      await service.handleEvent({
        source: 'github',
        eventType: 'pull_request',
        deliveryId: 'del-1',
        payload: {
          action: 'closed',
          pull_request: {
            number: 42,
            html_url: 'https://github.com/owner/repo/pull/42',
            merged: true,
            head: { ref: 'feat/test' },
          },
        },
      });

      expect(mockFeatureRepo.update).toHaveBeenCalledWith(
        expect.objectContaining({
          lifecycle: SdlcLifecycle.Maintain,
          pr: expect.objectContaining({ status: PrStatus.Merged }),
        })
      );
      expect(mockNotificationService.notify).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringContaining('merged'),
        })
      );
    });

    it('should update feature when PR is closed without merge', async () => {
      const feature = createMockFeature();
      vi.mocked(mockFeatureRepo.list).mockResolvedValue([feature]);

      await service.handleEvent({
        source: 'github',
        eventType: 'pull_request',
        deliveryId: 'del-2',
        payload: {
          action: 'closed',
          pull_request: {
            number: 42,
            html_url: 'https://github.com/owner/repo/pull/42',
            merged: false,
            head: { ref: 'feat/test' },
          },
        },
      });

      expect(mockFeatureRepo.update).toHaveBeenCalledWith(
        expect.objectContaining({
          pr: expect.objectContaining({ status: PrStatus.Closed }),
        })
      );
    });

    it('should match by branch when PR number does not match', async () => {
      const feature = createMockFeature({ pr: undefined });
      vi.mocked(mockFeatureRepo.list).mockResolvedValue([feature]);

      await service.handleEvent({
        source: 'github',
        eventType: 'pull_request',
        deliveryId: 'del-3',
        payload: {
          action: 'closed',
          pull_request: {
            number: 99,
            html_url: 'https://github.com/owner/repo/pull/99',
            merged: true,
            head: { ref: 'feat/test' },
          },
        },
      });

      expect(mockFeatureRepo.update).toHaveBeenCalled();
    });

    it('should ignore events for unknown features', async () => {
      vi.mocked(mockFeatureRepo.list).mockResolvedValue([]);

      await service.handleEvent({
        source: 'github',
        eventType: 'pull_request',
        deliveryId: 'del-4',
        payload: {
          action: 'closed',
          pull_request: {
            number: 999,
            html_url: 'https://github.com/owner/repo/pull/999',
            merged: true,
            head: { ref: 'unknown-branch' },
          },
        },
      });

      expect(mockFeatureRepo.update).not.toHaveBeenCalled();
    });
  });

  describe('handleEvent — check_suite', () => {
    it('should update CI status on check_suite completion', async () => {
      const feature = createMockFeature();
      vi.mocked(mockFeatureRepo.list).mockResolvedValue([feature]);

      await service.handleEvent({
        source: 'github',
        eventType: 'check_suite',
        deliveryId: 'del-5',
        payload: {
          action: 'completed',
          check_suite: {
            conclusion: 'success',
            head_branch: 'feat/test',
          },
        },
      });

      expect(mockFeatureRepo.update).toHaveBeenCalledWith(
        expect.objectContaining({
          pr: expect.objectContaining({ ciStatus: CiStatus.Success }),
        })
      );
    });

    it('should ignore non-completed check_suite actions', async () => {
      await service.handleEvent({
        source: 'github',
        eventType: 'check_suite',
        deliveryId: 'del-6',
        payload: {
          action: 'requested',
          check_suite: {
            conclusion: null,
            head_branch: 'feat/test',
          },
        },
      });

      expect(mockFeatureRepo.update).not.toHaveBeenCalled();
    });
  });

  describe('registerWebhooks', () => {
    it('should register webhooks for repos with review features', async () => {
      const feature = createMockFeature();
      vi.mocked(mockFeatureRepo.list).mockResolvedValue([feature]);
      vi.mocked(mockGitPrService.getRemoteUrl).mockResolvedValue('https://github.com/owner/repo');
      mockExecFn.mockResolvedValue({ stdout: JSON.stringify({ id: 123 }), stderr: '' });

      await service.registerWebhooks('https://tunnel.trycloudflare.com');

      expect(mockExecFn).toHaveBeenCalledWith(
        'gh',
        expect.arrayContaining([
          'api',
          '--method',
          'POST',
          expect.stringContaining('/repos/owner/repo/hooks'),
        ]),
        expect.objectContaining({ cwd: '/repo/path' })
      );
    });

    it('should handle registration failure gracefully', async () => {
      const feature = createMockFeature();
      vi.mocked(mockFeatureRepo.list).mockResolvedValue([feature]);
      vi.mocked(mockGitPrService.getRemoteUrl).mockResolvedValue('https://github.com/owner/repo');
      mockExecFn.mockRejectedValue(new Error('gh api failed'));

      // Should not throw
      await expect(
        service.registerWebhooks('https://tunnel.trycloudflare.com')
      ).resolves.toBeUndefined();
    });
  });

  describe('removeWebhooks', () => {
    it('should remove all registered webhooks', async () => {
      const feature = createMockFeature();
      vi.mocked(mockFeatureRepo.list).mockResolvedValue([feature]);
      vi.mocked(mockGitPrService.getRemoteUrl).mockResolvedValue('https://github.com/owner/repo');
      mockExecFn.mockResolvedValue({ stdout: JSON.stringify({ id: 456 }), stderr: '' });

      await service.registerWebhooks('https://tunnel.trycloudflare.com');
      mockExecFn.mockClear();

      await service.removeWebhooks();

      expect(mockExecFn).toHaveBeenCalledWith(
        'gh',
        expect.arrayContaining(['api', '--method', 'DELETE']),
        expect.any(Object)
      );
    });
  });

  describe('updateWebhookUrl', () => {
    it('should update URL for all registered webhooks', async () => {
      const feature = createMockFeature();
      vi.mocked(mockFeatureRepo.list).mockResolvedValue([feature]);
      vi.mocked(mockGitPrService.getRemoteUrl).mockResolvedValue('https://github.com/owner/repo');
      mockExecFn.mockResolvedValue({ stdout: JSON.stringify({ id: 789 }), stderr: '' });

      await service.registerWebhooks('https://old-url.trycloudflare.com');
      mockExecFn.mockClear();

      await service.updateWebhookUrl('https://new-url.trycloudflare.com');

      expect(mockExecFn).toHaveBeenCalledWith(
        'gh',
        expect.arrayContaining([
          'api',
          '--method',
          'PATCH',
          expect.stringContaining('/repos/owner/repo/hooks/'),
        ]),
        expect.any(Object)
      );
    });
  });

  describe('delivery history tracking', () => {
    it('should record successful deliveries', async () => {
      const feature = createMockFeature();
      vi.mocked(mockFeatureRepo.list).mockResolvedValue([feature]);

      await service.handleEvent({
        source: 'github',
        eventType: 'pull_request',
        deliveryId: 'hist-1',
        payload: {
          action: 'closed',
          pull_request: {
            number: 42,
            html_url: 'https://github.com/owner/repo/pull/42',
            merged: true,
            head: { ref: 'feat/test' },
          },
        },
      });

      const history = service.getDeliveryHistory();
      expect(history).toHaveLength(1);
      expect(history[0].deliveryId).toBe('hist-1');
      expect(history[0].status).toBe('success');
      expect(history[0].eventType).toBe('pull_request');
      expect(history[0].durationMs).toBeGreaterThanOrEqual(0);
    });

    it('should record ignored events for unhandled types', async () => {
      await service.handleEvent({
        source: 'github',
        eventType: 'ping',
        deliveryId: 'hist-2',
        payload: { zen: 'Keep it logically awesome.' },
      });

      const history = service.getDeliveryHistory();
      expect(history).toHaveLength(1);
      expect(history[0].status).toBe('ignored');
      expect(history[0].statusMessage).toContain('Unhandled event type');
    });

    it('should return newest deliveries first', async () => {
      vi.mocked(mockFeatureRepo.list).mockResolvedValue([]);

      await service.handleEvent({
        source: 'github',
        eventType: 'ping',
        deliveryId: 'first',
        payload: {},
      });
      await service.handleEvent({
        source: 'github',
        eventType: 'ping',
        deliveryId: 'second',
        payload: {},
      });

      const history = service.getDeliveryHistory();
      expect(history).toHaveLength(2);
      expect(history[0].deliveryId).toBe('second');
      expect(history[1].deliveryId).toBe('first');
    });

    it('should expose registered webhooks via getter', async () => {
      const feature = createMockFeature();
      vi.mocked(mockFeatureRepo.list).mockResolvedValue([feature]);
      vi.mocked(mockGitPrService.getRemoteUrl).mockResolvedValue('https://github.com/owner/repo');
      mockExecFn.mockResolvedValue({ stdout: JSON.stringify({ id: 555 }), stderr: '' });

      await service.registerWebhooks('https://tunnel.trycloudflare.com');

      const registered = service.getRegisteredWebhooks();
      expect(registered).toHaveLength(1);
      expect(registered[0].repoFullName).toBe('owner/repo');
      expect(registered[0].webhookId).toBe(555);
    });
  });

  describe('registerWebhookForSingleRepo', () => {
    it('should register a webhook and add it to the registered list', async () => {
      vi.mocked(mockGitPrService.getRemoteUrl).mockResolvedValue('https://github.com/owner/repo');
      mockExecFn.mockResolvedValue({ stdout: JSON.stringify({ id: 42 }), stderr: '' });

      const result = await service.registerWebhookForSingleRepo(
        '/home/user/repo',
        'https://tunnel.example.com/api/webhooks/github'
      );

      expect(result).not.toBeNull();
      expect(result!.repoFullName).toBe('owner/repo');
      expect(result!.webhookId).toBe(42);
      expect(service.getRegisteredWebhooks()).toHaveLength(1);
    });

    it('should no-op when a webhook is already registered for the repo path', async () => {
      vi.mocked(mockGitPrService.getRemoteUrl).mockResolvedValue('https://github.com/owner/repo');
      mockExecFn.mockResolvedValue({ stdout: JSON.stringify({ id: 42 }), stderr: '' });

      await service.registerWebhookForSingleRepo(
        '/home/user/repo',
        'https://tunnel.example.com/api/webhooks/github'
      );
      const callCountAfterFirst = mockExecFn.mock.calls.length;

      await service.registerWebhookForSingleRepo(
        '/home/user/repo',
        'https://tunnel.example.com/api/webhooks/github'
      );

      // No additional gh api calls for the second registration
      expect(mockExecFn.mock.calls.length).toBe(callCountAfterFirst);
      expect(service.getRegisteredWebhooks()).toHaveLength(1);
    });

    it('should normalize backslash paths before comparing', async () => {
      vi.mocked(mockGitPrService.getRemoteUrl).mockResolvedValue('https://github.com/owner/repo');
      mockExecFn.mockResolvedValue({ stdout: JSON.stringify({ id: 42 }), stderr: '' });

      await service.registerWebhookForSingleRepo(
        '/home/user/repo',
        'https://tunnel.example.com/api/webhooks/github'
      );
      await service.registerWebhookForSingleRepo(
        '\\home\\user\\repo',
        'https://tunnel.example.com/api/webhooks/github'
      );
      expect(service.getRegisteredWebhooks()).toHaveLength(1);
    });

    it('should return the existing webhook when already registered', async () => {
      vi.mocked(mockGitPrService.getRemoteUrl).mockResolvedValue('https://github.com/owner/repo');
      mockExecFn.mockResolvedValue({ stdout: JSON.stringify({ id: 42 }), stderr: '' });

      const first = await service.registerWebhookForSingleRepo(
        '/home/user/repo',
        'https://tunnel.example.com/api/webhooks/github'
      );
      const second = await service.registerWebhookForSingleRepo(
        '/home/user/repo',
        'https://tunnel.example.com/api/webhooks/github'
      );
      expect(first).toEqual(second);
    });
  });

  describe('removeWebhookForRepo', () => {
    it('should remove a webhook from GitHub and the registered list', async () => {
      vi.mocked(mockGitPrService.getRemoteUrl).mockResolvedValue('https://github.com/owner/repo');
      mockExecFn.mockResolvedValue({ stdout: JSON.stringify({ id: 42 }), stderr: '' });

      await service.registerWebhookForSingleRepo(
        '/home/user/repo',
        'https://tunnel.example.com/api/webhooks/github'
      );
      expect(service.getRegisteredWebhooks()).toHaveLength(1);
      mockExecFn.mockClear();

      await service.removeWebhookForRepo('/home/user/repo');
      expect(service.getRegisteredWebhooks()).toHaveLength(0);
      expect(mockExecFn).toHaveBeenCalledWith(
        'gh',
        expect.arrayContaining(['api', '--method', 'DELETE']),
        expect.any(Object)
      );
    });

    it('should no-op when repo path is not found', async () => {
      mockExecFn.mockClear();
      await service.removeWebhookForRepo('/nonexistent/path');
      expect(mockExecFn).not.toHaveBeenCalled();
    });

    it('should normalize paths when finding webhook to remove', async () => {
      vi.mocked(mockGitPrService.getRemoteUrl).mockResolvedValue('https://github.com/owner/repo');
      mockExecFn.mockResolvedValue({ stdout: JSON.stringify({ id: 42 }), stderr: '' });

      await service.registerWebhookForSingleRepo(
        '/home/user/repo',
        'https://tunnel.example.com/api/webhooks/github'
      );
      await service.removeWebhookForRepo('\\home\\user\\repo');
      expect(service.getRegisteredWebhooks()).toHaveLength(0);
    });
  });
});
