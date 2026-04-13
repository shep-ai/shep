import { injectable } from 'tsyringe';
import type {
  IWebhookService,
  WebhookPayload,
} from '../../../application/ports/output/services/webhook.interface.js';

/**
 * No-op webhook service.
 *
 * Default implementation that silently skips delivery.
 * Replace with a real implementation (e.g., Slack, HTTP POST)
 * when webhook endpoints are configured.
 */
@injectable()
export class NoopWebhookService implements IWebhookService {
  async deliver(_payload: WebhookPayload): Promise<number> {
    return 0;
  }
}
