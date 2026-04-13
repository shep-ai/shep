import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SendWebhookUseCase } from '@/application/use-cases/integrations/send-webhook.use-case.js';
import type {
  IWebhookService,
  WebhookPayload,
} from '@/application/ports/output/services/webhook.interface.js';

function createMockWebhookService(): IWebhookService {
  return {
    deliver: vi.fn().mockResolvedValue(1),
  };
}

describe('SendWebhookUseCase', () => {
  let useCase: SendWebhookUseCase;
  let webhookService: IWebhookService;

  beforeEach(() => {
    webhookService = createMockWebhookService();
    useCase = new SendWebhookUseCase(webhookService);
  });

  it('delivers a webhook and returns count', async () => {
    const payload: WebhookPayload = {
      event: 'work_item.created',
      projectId: 'proj-1',
      actorId: 'user-1',
      data: { title: 'New item' },
      timestamp: new Date(),
    };

    const result = await useCase.execute(payload);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.delivered).toBe(1);
    }
    expect(webhookService.deliver).toHaveBeenCalledWith(payload);
  });

  it('rejects empty event type', async () => {
    const result = await useCase.execute({
      event: '',
      data: {},
      timestamp: new Date(),
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('Event type');
    }
  });

  it('handles delivery errors gracefully', async () => {
    vi.mocked(webhookService.deliver).mockRejectedValue(new Error('Connection refused'));

    const result = await useCase.execute({
      event: 'work_item.updated',
      data: {},
      timestamp: new Date(),
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('Connection refused');
    }
  });
});
