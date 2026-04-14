/**
 * ChatStateAssembler
 *
 * Pure read-side DTO assembly. Reads messages, session state, usage,
 * turn statuses, pending interaction, and workflow steps from their
 * respective stores and assembles the ChatState DTO.
 *
 * No mutations — every method is a pure projection.
 *
 * Extracted from `InteractiveSessionService` in Phase 6 of the strangler refactor.
 * See `docs/plans/2026-04-14-interactive-session-service-refactor.md`.
 */

import type { ChatState } from '../../../../application/ports/output/services/interactive-session-service.interface.js';
import type { IInteractiveMessageRepository } from '../../../../application/ports/output/repositories/interactive-message-repository.interface.js';
import type { IInteractiveSessionRepository } from '../../../../application/ports/output/repositories/interactive-session-repository.interface.js';
import type { IWorkflowStepRepository } from '../../../../application/ports/output/repositories/workflow-step-repository.interface.js';
import {
  InteractiveSessionStatus,
  WorkflowStepStatus,
} from '../../../../domain/generated/output.js';
import type { SessionRegistry } from '../core/session-registry.js';

export class ChatStateAssembler {
  constructor(
    private readonly messageRepo: IInteractiveMessageRepository,
    private readonly sessionRepo: IInteractiveSessionRepository,
    private readonly workflowStepRepo: IWorkflowStepRepository,
    private readonly registry: SessionRegistry
  ) {}

  async assemble(featureId: string): Promise<ChatState> {
    // DB messages
    const messages = await this.messageRepo.findByFeatureId(featureId);

    // Find active in-memory session
    const state = this.registry.findActiveStateForFeature(featureId);
    let sessionStatus: string | null = null;
    let streamingText: string | null = null;
    let sessionInfo: ChatState['sessionInfo'] = null;

    if (state) {
      const dbSession = await this.sessionRepo.findById(state.sessionId);
      sessionStatus = dbSession?.status ?? null;
      if (state.currentAssistantBuffer) {
        streamingText = state.currentAssistantBuffer;
      }
      // Resolve model display: explicit override > default
      const displayModel = state.model ?? 'claude-sonnet-4-6';

      const usage = await this.sessionRepo.getUsage(state.sessionId);
      sessionInfo = {
        pid: null, // SDK manages process internally
        sessionId: state.agentSessionId ?? state.sessionId,
        model: displayModel,
        startedAt: dbSession?.startedAt
          ? new Date(dbSession.startedAt as unknown as string).toISOString()
          : new Date().toISOString(),
        lastActivityAt: dbSession?.lastActivityAt
          ? new Date(dbSession.lastActivityAt as unknown as string).toISOString()
          : new Date().toISOString(),
        totalCostUsd: usage?.totalCostUsd ?? null,
        totalInputTokens: usage?.totalInputTokens ?? null,
        totalOutputTokens: usage?.totalOutputTokens ?? null,
      };
    } else {
      // No in-memory state — check DB for last session (e.g. after server restart)
      const latest = await this.sessionRepo.findByFeatureId(featureId);
      if (latest) {
        sessionStatus = latest.status as string;
        if (
          latest.status !== InteractiveSessionStatus.stopped &&
          latest.status !== InteractiveSessionStatus.error
        ) {
          const latestUsage = await this.sessionRepo.getUsage(latest.id);
          sessionInfo = {
            pid: null,
            sessionId: latest.id,
            model: null,
            startedAt: latest.startedAt
              ? new Date(latest.startedAt as unknown as string).toISOString()
              : new Date().toISOString(),
            lastActivityAt: latest.lastActivityAt
              ? new Date(latest.lastActivityAt as unknown as string).toISOString()
              : new Date().toISOString(),
            totalCostUsd: latestUsage?.totalCostUsd ?? null,
            totalInputTokens: latestUsage?.totalInputTokens ?? null,
            totalOutputTokens: latestUsage?.totalOutputTokens ?? null,
          };
        }
      }
    }

    // Resolve turn status from DB
    let turnStatus = 'idle';
    const activeState = state;
    if (activeState) {
      const statuses = await this.sessionRepo.getTurnStatuses([featureId]);
      turnStatus = statuses.get(featureId) ?? 'idle';
    } else {
      const latest = await this.sessionRepo.findByFeatureId(featureId);
      if (latest) {
        const statuses = await this.sessionRepo.getTurnStatuses([featureId]);
        turnStatus = statuses.get(featureId) ?? 'idle';
      }
    }

    // Include pending interaction if one exists
    const pendingInteraction = state?.pendingInteraction ?? null;

    // Workflow view — derived entirely from the DB
    const workflowSteps = await this.workflowStepRepo.listByFeature(featureId);
    let workflow: ChatState['workflow'] = null;
    if (workflowSteps.length > 0) {
      const running = workflowSteps.find((s) => s.status === WorkflowStepStatus.running);
      workflow = {
        workflowId: workflowSteps[0].workflowId,
        steps: workflowSteps,
        currentStepId: running?.id ?? null,
      };
      if (running) turnStatus = 'processing';
    }

    return {
      messages,
      sessionStatus,
      streamingText,
      sessionInfo,
      turnStatus,
      pendingInteraction,
      workflow,
    };
  }
}
