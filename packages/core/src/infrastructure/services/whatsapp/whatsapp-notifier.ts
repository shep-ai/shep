/**
 * WhatsApp Notifier (spec 101, task-11)
 *
 * Maps an agent lifecycle NotificationEvent to a localized WhatsApp message and
 * delivers it to the thread bound to the event's feature/application — via the
 * gateway the connection service currently owns. Fire-and-forget: notify()
 * never throws; delivery and errors are handled asynchronously.
 *
 * Only the actionable lifecycle subset is forwarded (started / needs-approval /
 * completed / failed / blocking question); other event types are ignored.
 */

import { injectable, inject } from 'tsyringe';

import type { IWhatsAppNotifier } from '../../../application/ports/output/services/whatsapp-notifier.interface.js';
import type { IWhatsAppThreadMappingRepository } from '../../../application/ports/output/repositories/whatsapp-thread-mapping-repository.interface.js';
import type { ISettingsRepository } from '../../../application/ports/output/repositories/settings.repository.interface.js';
import type { ILogger } from '../../../application/ports/output/services/logger.interface.js';
import {
  Language,
  NotificationEventType,
  WhatsAppThreadTargetKind,
  type NotificationEvent,
} from '../../../domain/generated/output.js';
import {
  WhatsAppMessageKind,
  whatsAppMessage,
} from '../../../application/use-cases/whatsapp/whatsapp-message.types.js';
import {
  applicationIdFromFeatureId,
  isApplicationFeatureId,
} from '../../../domain/shared/feature-id.js';
import { renderWhatsAppMessage } from './whatsapp-message-templates.js';
import { WhatsAppConnectionService } from './whatsapp-connection.service.js';

/** Lifecycle events we forward to WhatsApp, mapped to outbound message kinds. */
const EVENT_TO_MESSAGE_KIND: Partial<Record<NotificationEventType, WhatsAppMessageKind>> = {
  [NotificationEventType.AgentStarted]: WhatsAppMessageKind.AgentStarted,
  [NotificationEventType.WaitingApproval]: WhatsAppMessageKind.NeedsApproval,
  [NotificationEventType.AgentCompleted]: WhatsAppMessageKind.AgentCompleted,
  [NotificationEventType.AgentFailed]: WhatsAppMessageKind.AgentFailed,
  [NotificationEventType.AgentQuestionBlocking]: WhatsAppMessageKind.AgentQuestion,
};

/** Resolve the thread-mapping target (kind + id) from a notification's featureId. */
function targetForFeatureId(featureId: string): { kind: WhatsAppThreadTargetKind; id: string } {
  if (isApplicationFeatureId(featureId)) {
    return {
      kind: WhatsAppThreadTargetKind.Application,
      id: applicationIdFromFeatureId(featureId) ?? featureId,
    };
  }
  return { kind: WhatsAppThreadTargetKind.Feature, id: featureId };
}

@injectable()
export class WhatsAppNotifier implements IWhatsAppNotifier {
  constructor(
    @inject('ISettingsRepository') private readonly settingsRepository: ISettingsRepository,
    @inject('IWhatsAppThreadMappingRepository')
    private readonly threadMappings: IWhatsAppThreadMappingRepository,
    @inject(WhatsAppConnectionService)
    private readonly connectionService: WhatsAppConnectionService,
    @inject('ILogger') private readonly logger: ILogger
  ) {}

  notify(event: NotificationEvent): void {
    void this.deliver(event).catch((err) => {
      this.logger.error('[whatsapp] failed to deliver notification', {
        error: err instanceof Error ? err.message : String(err),
      });
    });
  }

  private async deliver(event: NotificationEvent): Promise<void> {
    const kind = EVENT_TO_MESSAGE_KIND[event.eventType];
    if (!kind) return;

    const settings = await this.settingsRepository.load();
    if (!settings?.featureFlags?.whatsappDispatch || !settings.whatsapp?.enabled) return;

    const target = targetForFeatureId(event.featureId);
    const mapping = await this.threadMappings.findActiveByTarget(target.kind, target.id);
    if (!mapping) return;

    const gateway = this.connectionService.getActiveGateway();
    if (!gateway) return;

    const locale = (settings.user?.preferredLanguage as Language) ?? Language.English;
    const text = renderWhatsAppMessage(
      whatsAppMessage(kind, {
        title: event.featureName,
        ...(event.phaseName ? { detail: event.phaseName } : {}),
      }),
      locale
    );

    await gateway.sendMessage(mapping.threadId, text);
  }
}
