/**
 * Route WhatsApp Reply Use Case (spec 101)
 *
 * Handles an inbound WhatsApp message that arrives on a thread ALREADY bound to
 * a shep entity. For an Application-bound thread, the reply is forwarded into
 * the live interactive agent session (the two-way chat loop). For a
 * Feature-bound thread, the reply is classified as approve / reject / other and
 * routed to the HITL approve/reject use cases against the feature's latest run.
 *
 * Pure orchestration — no rendering, no transport. Returns a structured
 * outcome (WhatsAppMessage) the infrastructure layer renders and sends.
 */

import { injectable, inject } from 'tsyringe';

import type { IApplicationRepository } from '../../ports/output/repositories/application-repository.interface.js';
import type { IWhatsAppThreadMappingRepository } from '../../ports/output/repositories/whatsapp-thread-mapping-repository.interface.js';
import type { IAgentRunRepository } from '../../ports/output/agents/agent-run-repository.interface.js';
import type { ILogger } from '../../ports/output/services/logger.interface.js';
import type { WhatsAppThreadMapping } from '../../ports/output/repositories/whatsapp-thread-mapping-repository.interface.js';
import { SendInteractiveMessageUseCase } from '../interactive/send-interactive-message.use-case.js';
import { ApproveAgentRunUseCase } from '../agents/approve-agent-run.use-case.js';
import { RejectAgentRunUseCase } from '../agents/reject-agent-run.use-case.js';
import { WhatsAppThreadTargetKind } from '../../../domain/generated/output.js';
import { featureIdForApplication } from '../../../domain/shared/feature-id.js';
import { classifyReplyIntent, WhatsAppReplyIntent } from './whatsapp-reply-intent.js';
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
    @inject('IAgentRunRepository')
    private readonly agentRunRepo: IAgentRunRepository,
    @inject(ApproveAgentRunUseCase)
    private readonly approveAgentRun: ApproveAgentRunUseCase,
    @inject(RejectAgentRunUseCase)
    private readonly rejectAgentRun: RejectAgentRunUseCase,
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
        return this.routeFeatureHitl(mapping.targetId, content);
      default:
        return { message: whatsAppMessage(WhatsAppMessageKind.UnknownCommand) };
    }
  }

  /**
   * Route a reply on a feature-bound thread to a HITL approve/reject decision.
   * Free-text that isn't a clear yes/no is treated as UnknownCommand so the
   * agent never receives an ambiguous "approval".
   */
  private async routeFeatureHitl(featureId: string, content: string): Promise<WhatsAppReplyResult> {
    const intent = classifyReplyIntent(content);
    if (intent === WhatsAppReplyIntent.Other) {
      return { message: whatsAppMessage(WhatsAppMessageKind.UnknownCommand) };
    }

    const run = await this.agentRunRepo.findLatestByFeatureId(featureId);
    if (!run) {
      this.logger.warn('[whatsapp] no agent run found for feature-bound reply', { featureId });
      return { message: whatsAppMessage(WhatsAppMessageKind.NoActiveThread) };
    }

    try {
      if (intent === WhatsAppReplyIntent.Approve) {
        const result = await this.approveAgentRun.execute(run.id);
        return {
          message: result.approved
            ? whatsAppMessage(WhatsAppMessageKind.ApprovalAccepted)
            : whatsAppMessage(WhatsAppMessageKind.Error, { detail: result.reason }),
        };
      }
      const result = await this.rejectAgentRun.execute(run.id, content);
      return {
        message: result.rejected
          ? whatsAppMessage(WhatsAppMessageKind.ApprovalRejected)
          : whatsAppMessage(WhatsAppMessageKind.Error, { detail: result.reason }),
      };
    } catch (err) {
      this.logger.error('[whatsapp] failed to apply HITL decision', {
        featureId,
        error: err instanceof Error ? err.message : String(err),
      });
      return {
        message: whatsAppMessage(WhatsAppMessageKind.Error, {
          detail: err instanceof Error ? err.message : undefined,
        }),
      };
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
