/**
 * Dispatch WhatsApp Message Use Case (spec 101)
 *
 * Handles an inbound WhatsApp message that arrives on a thread with NO active
 * shep binding: authorizes the sender, creates a new interactive application
 * session from the message text (via the existing CreateApplicationUseCase),
 * and persists the thread↔session mapping so future replies route back.
 *
 * Pure orchestration — no rendering, no transport. Returns a structured
 * outcome (WhatsAppMessage) that the infrastructure layer renders and sends.
 */

import { injectable, inject } from 'tsyringe';

import type { ISettingsRepository } from '../../ports/output/repositories/settings.repository.interface.js';
import type { IWhatsAppThreadMappingRepository } from '../../ports/output/repositories/whatsapp-thread-mapping-repository.interface.js';
import type { ILogger } from '../../ports/output/services/logger.interface.js';
import type { WhatsAppInboundMessage } from '../../ports/output/services/whatsapp-gateway.interface.js';
import { CreateApplicationUseCase } from '../applications/create-application.use-case.js';
import { WhatsAppThreadTargetKind } from '../../../domain/generated/output.js';
import { isAuthorizedSender } from './whatsapp-phone.js';
import {
  WhatsAppMessageKind,
  whatsAppMessage,
  type WhatsAppMessage,
} from './whatsapp-message.types.js';

/** Outcome of dispatching an inbound message. */
export interface WhatsAppDispatchResult {
  /** What to reply to the thread. */
  message: WhatsAppMessage;
  /** The created application id, when a session was started. */
  applicationId?: string;
}

/** Trim a request to a short, single-line title for acknowledgements. */
function toTitle(text: string, max = 60): string {
  const oneLine = text.replace(/\s+/g, ' ').trim();
  return oneLine.length > max ? `${oneLine.slice(0, max - 1)}…` : oneLine;
}

@injectable()
export class DispatchWhatsAppMessageUseCase {
  constructor(
    @inject('ISettingsRepository')
    private readonly settingsRepository: ISettingsRepository,
    @inject(CreateApplicationUseCase)
    private readonly createApplication: CreateApplicationUseCase,
    @inject('IWhatsAppThreadMappingRepository')
    private readonly threadMappings: IWhatsAppThreadMappingRepository,
    @inject('ILogger')
    private readonly logger: ILogger
  ) {}

  async execute(inbound: WhatsAppInboundMessage): Promise<WhatsAppDispatchResult> {
    const settings = await this.settingsRepository.load();

    if (!isAuthorizedSender(inbound.from, settings?.whatsapp)) {
      this.logger.warn('[whatsapp] rejected dispatch from unauthorized sender', {
        from: inbound.from,
      });
      return { message: whatsAppMessage(WhatsAppMessageKind.NotLinked) };
    }

    const description = inbound.text.trim();
    if (description.length === 0) {
      return { message: whatsAppMessage(WhatsAppMessageKind.UnknownCommand) };
    }

    try {
      const result = await this.createApplication.execute({
        description,
        initialPrompt: description,
      });

      await this.threadMappings.upsert({
        threadId: inbound.threadId,
        targetKind: WhatsAppThreadTargetKind.Application,
        targetId: result.application.id,
      });

      return {
        message: whatsAppMessage(WhatsAppMessageKind.DispatchedApplication, {
          title: toTitle(description),
        }),
        applicationId: result.application.id,
      };
    } catch (err) {
      this.logger.error('[whatsapp] failed to dispatch application', {
        error: err instanceof Error ? err.message : String(err),
      });
      return {
        message: whatsAppMessage(WhatsAppMessageKind.Error, {
          detail: err instanceof Error ? err.message : undefined,
        }),
      };
    }
  }
}
