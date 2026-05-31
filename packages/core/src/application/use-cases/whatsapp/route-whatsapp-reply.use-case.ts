/**
 * Route WhatsApp Reply Use Case (spec 101)
 *
 * Handles an inbound WhatsApp message that arrives on a thread ALREADY bound to
 * a shep entity. For an Application-bound thread, the reply is forwarded into
 * the live interactive agent session (the two-way chat loop). Feature-bound
 * threads (autonomous HITL gates) are a documented follow-on — task-6 only ever
 * creates Application bindings in this iteration, so that branch is unreachable
 * today and returns a clear, guided outcome rather than guessing.
 *
 * Pure orchestration — no rendering, no transport. Returns a structured
 * outcome (WhatsAppMessage) the infrastructure layer renders and sends.
 */

import { injectable, inject } from 'tsyringe';

import type { IApplicationRepository } from '../../ports/output/repositories/application-repository.interface.js';
import type { IWhatsAppThreadMappingRepository } from '../../ports/output/repositories/whatsapp-thread-mapping-repository.interface.js';
import type { ILogger } from '../../ports/output/services/logger.interface.js';
import type { WhatsAppThreadMapping } from '../../ports/output/repositories/whatsapp-thread-mapping-repository.interface.js';
import { SendInteractiveMessageUseCase } from '../interactive/send-interactive-message.use-case.js';
import { WhatsAppThreadTargetKind } from '../../../domain/generated/output.js';
import { featureIdForApplication } from '../../../domain/shared/feature-id.js';
import {
  WhatsAppMessageKind,
  whatsAppMessage,
  type WhatsAppMessage,
} from './whatsapp-message.types.js';

export interface RouteWhatsAppReplyInput {
  /** The active mapping the inbound thread resolved to. */
  mapping: WhatsAppThreadMapping;
  /** The reply text. */
  text: string;
}

export interface WhatsAppReplyResult {
  message: WhatsAppMessage;
}

@injectable()
export class RouteWhatsAppReplyUseCase {
  constructor(
    @inject('IApplicationRepository')
    private readonly applicationRepo: IApplicationRepository,
    @inject(SendInteractiveMessageUseCase)
    private readonly sendInteractiveMessage: SendInteractiveMessageUseCase,
    @inject('IWhatsAppThreadMappingRepository')
    private readonly threadMappings: IWhatsAppThreadMappingRepository,
    @inject('ILogger')
    private readonly logger: ILogger
  ) {}

  async execute(input: RouteWhatsAppReplyInput): Promise<WhatsAppReplyResult> {
    const { mapping, text } = input;
    const content = text.trim();
    if (content.length === 0) {
      return { message: whatsAppMessage(WhatsAppMessageKind.UnknownCommand) };
    }

    switch (mapping.targetKind) {
      case WhatsAppThreadTargetKind.Application:
        return this.forwardToApplicationSession(mapping, content);
      case WhatsAppThreadTargetKind.Feature:
        // Feature-bound HITL approve/reject over WhatsApp is a follow-on
        // (needs a feature→pending-run lookup not on the repo port yet).
        this.logger.info('[whatsapp] reply to feature-bound thread is not yet supported', {
          featureId: mapping.targetId,
        });
        return { message: whatsAppMessage(WhatsAppMessageKind.UnknownCommand) };
      default:
        return { message: whatsAppMessage(WhatsAppMessageKind.UnknownCommand) };
    }
  }

  private async forwardToApplicationSession(
    mapping: WhatsAppThreadMapping,
    content: string
  ): Promise<WhatsAppReplyResult> {
    const applicationId = mapping.targetId;
    const application = await this.applicationRepo.findById(applicationId);
    if (!application) {
      // The bound app no longer exists — drop the stale mapping for this thread.
      await this.threadMappings.deactivate(mapping.threadId);
      this.logger.warn('[whatsapp] reply target application not found', { applicationId });
      return { message: whatsAppMessage(WhatsAppMessageKind.NoActiveThread) };
    }

    try {
      await this.sendInteractiveMessage.execute({
        featureId: featureIdForApplication(application.id),
        content,
        worktreePath: application.repositoryPath,
        ...(application.modelOverride ? { model: application.modelOverride } : {}),
        ...(application.agentType ? { agentType: application.agentType } : {}),
      });
      return { message: whatsAppMessage(WhatsAppMessageKind.ReplyForwardedToSession) };
    } catch (err) {
      this.logger.error('[whatsapp] failed to forward reply to session', {
        applicationId,
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
