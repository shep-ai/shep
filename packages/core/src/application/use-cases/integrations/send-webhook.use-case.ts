import { injectable, inject } from 'tsyringe';
import type {
  IWebhookService,
  WebhookPayload,
} from '../../ports/output/services/webhook.interface.js';

export type SendWebhookResult = { ok: true; delivered: number } | { ok: false; error: string };

@injectable()
export class SendWebhookUseCase {
  constructor(@inject('IWebhookService') private readonly webhookService: IWebhookService) {}

  async execute(payload: WebhookPayload): Promise<SendWebhookResult> {
    if (!payload.event) {
      return { ok: false, error: 'Event type is required.' };
    }

    try {
      const delivered = await this.webhookService.deliver(payload);
      return { ok: true, delivered };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Webhook delivery failed';
      return { ok: false, error: message };
    }
  }
}
