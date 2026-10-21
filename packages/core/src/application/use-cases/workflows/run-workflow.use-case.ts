/**
 * Run Workflow Use Case
 *
 * Orchestrates a multi-step workflow against an interactive session.
 * Owns the step lifecycle — ensures rows exist, transitions each
 * from pending → running → done/failed, and tags every message the
 * agent produces during a step with the step's id — so the UI can
 * render a robust tracker that survives refreshes and daemon
 * restarts without any marker parsing.
 *
 * Contract with the session service:
 *   - `setActiveStep(featureId, stepId)` BEFORE the agent turn →
 *      every `persistMessage` call during the turn tags with stepId.
 *   - `subscribeByFeature` + `waitForTurnDone` lets us sequentially
 *      walk steps: each step awaits its own agent turn completion
 *      before moving on.
 *   - `clearActiveStep(featureId)` AFTER the turn — keeps later
 *      out-of-band messages (e.g. a user message typed into the
 *      chat after the workflow finishes) from being tagged.
 *
 * Robustness properties:
 *   1. The step row transitions to `running` BEFORE `sendUserMessage`
 *      and to `done`/`failed` AFTER `waitForTurnDone`, so any crash
 *      between them leaves the row `running` — which boot-time
 *      recovery flips to `interrupted`.
 *   2. `ensureSteps` is idempotent; resuming just skips already-done
 *      steps and stops at any `running`/`interrupted`/`failed` row
 *      (the user retry flow can reset them to `pending`).
 *   3. Each step is CLAIMED with a guarded `pending → running` write.
 *      A resume (`ResumeApplicationWorkflowUseCase`) claims the same
 *      way, so only one walker ever sends a step's prompt; the walker
 *      that loses stops and reports `{ completed: false }` instead of
 *      claiming the workflow finished.
 */

import { injectable, inject } from 'tsyringe';
import type { IWorkflowStepRepository } from '../../ports/output/repositories/workflow-step-repository.interface.js';
import type { IInteractiveSessionService } from '../../ports/output/services/interactive-session-service.interface.js';
import type { IInteractiveSessionRepository } from '../../ports/output/repositories/interactive-session-repository.interface.js';
import type { ILogger } from '../../ports/output/services/logger.interface.js';
import type { SendInteractiveMessageUseCase } from '../interactive/send-interactive-message.use-case.js';
import { WorkflowStepStatus, type WorkflowStep } from '../../../domain/generated/output.js';
import type { WorkflowDefinition } from '../applications/application-creation.workflow.js';

/** Per-step usage snapshot. All fields are cumulative session totals
 *  captured BEFORE or AFTER a step runs; a diff between two snapshots
 *  gives the usage attributable to that step alone. */
interface UsageSnapshot {
  costUsd: number;
  inputTokens: number;
  outputTokens: number;
}

const ZERO_USAGE: UsageSnapshot = { costUsd: 0, inputTokens: 0, outputTokens: 0 };

export interface RunWorkflowInput {
  featureId: string;
  worktreePath: string;
  workflow: WorkflowDefinition;
  /**
   * Optional wrapper applied to the FIRST step's prompt. The
   * application-creation flow uses this to inject the
   * "Read `SHEP_BRIEF.md` first" directive on turn 1 without
   * polluting any of the later step prompts.
   */
  firstStepPromptWrapper?: (stepPrompt: string) => string;
  /**
   * Visible first chat bubble — what the user sees as their own
   * first message. When set, the orchestrator uses this as the
   * `content` of the first `sendMessage.execute` call (the agent
   * sees a different prompt via `agentKickoffOverride` /
   * `firstStepPromptWrapper`). Used by the application-creation
   * flow to show "build me a todo app" instead of the full step 1
   * instructions in the user bubble.
   */
  visibleFirstMessage?: string;
  /**
   * Optional model / agent overrides to thread through to the
   * session service. Used by Application chat which pins its own
   * model/agent on the Application entity.
   */
  model?: string;
  agentType?: string;
  /**
   * When true, the orchestrator SKIPS the step that would persist
   * `visibleFirstMessage` as the user's first chat bubble — the
   * caller has already written it to the DB in the foreground so
   * the UI can render it instantly. The session still boots and
   * the agent still receives the wrapped first-step prompt, but no
   * second user message row is created.
   *
   * Used by `CreateApplicationUseCase.dispatchScaffoldAndWorkflow`
   * so the user's bubble is visible from page load even though the
   * scaffold + session boot run in the background.
   */
  firstUserMessageAlreadyPersisted?: boolean;
}

export interface RunWorkflowResult {
  /**
   * True only when every step ran to `done` in this call. False when the
   * walk stopped at a step it could not claim — another walker owns it, or
   * it needs a retry — so the caller must not mark the workflow complete.
   */
  completed: boolean;
}

const CLAIMABLE = { allowedFrom: [WorkflowStepStatus.pending] } as const;

@injectable()
export class RunWorkflowUseCase {
  constructor(
    @inject('IWorkflowStepRepository')
    private readonly stepRepo: IWorkflowStepRepository,
    @inject('IInteractiveSessionService')
    private readonly session: IInteractiveSessionService,
    @inject('SendInteractiveMessageUseCase')
    private readonly sendMessage: SendInteractiveMessageUseCase,
    @inject('IInteractiveSessionRepository')
    private readonly sessionRepoForUsage: IInteractiveSessionRepository,
    @inject('ILogger')
    private readonly logger: ILogger
  ) {}

  async execute(input: RunWorkflowInput): Promise<RunWorkflowResult> {
    // 1. Boot the session by sending the first step's prompt. The
    //    very first `sendMessage.execute` causes the session
    //    service to create the interactive session row in SQLite
    //    and start the agent process asynchronously. We need a
    //    stable `sessionId` for the workflow_steps FK, so we issue
    //    the first send, then look up the freshly-created session
    //    id via `getChatState`.
    //
    //    Note: the FIRST step's content is `visibleFirstMessage`
    //    (the user's verbatim description), not the step prompt,
    //    so the chat UI shows the user's own words in the first
    //    bubble. The agent sees `firstStepPromptWrapper(step.prompt)`
    //    via `agentKickoffOverride`.
    const firstStepDef = input.workflow.steps[0];
    if (!firstStepDef) return { completed: true };

    // Subscribe before sending to avoid racing a fast first turn. It is only
    // awaited after the session id is resolved, so mark it handled: a boot
    // that fails in that window must not surface as an unhandled rejection.
    const firstTurnDone = this.session.waitForTurnDone(input.featureId);
    firstTurnDone.catch(() => undefined);

    const firstAgentPrompt = input.firstStepPromptWrapper
      ? input.firstStepPromptWrapper(firstStepDef.prompt)
      : firstStepDef.prompt;

    await this.sendMessage.execute({
      featureId: input.featureId,
      content: input.visibleFirstMessage ?? firstStepDef.prompt,
      worktreePath: input.worktreePath,
      model: input.model,
      agentType: input.agentType,
      agentKickoffOverride: firstAgentPrompt,
      // Skip the DB-persist step when the caller already wrote the
      // user's first bubble in the foreground. The session still
      // boots and sees `firstAgentPrompt`; we just don't create a
      // duplicate row for `visibleFirstMessage`.
      persistUserMessage: !input.firstUserMessageAlreadyPersisted,
    });

    // Resolve the session id — newly booted, so poll briefly.
    const sessionId = await this.resolveSessionId(input.featureId);
    if (!sessionId) {
      // No session, so no steps were seeded: this is a failure, not a
      // finished workflow — returning normally would mark setup complete.
      throw new Error(
        `The interactive session for ${input.featureId} did not start, so no workflow step ran`
      );
    }

    // 2. Idempotent step bootstrap. The user-facing tracker now
    //    has all 9 pending cards to render.
    const seeds = input.workflow.steps.map((s, index) => ({
      stepKey: s.stepKey,
      stepIndex: index,
      title: s.title,
      description: s.description,
    }));
    const steps = await this.stepRepo.ensureSteps(
      sessionId,
      input.workflow.id,
      input.featureId,
      seeds
    );
    for (const step of steps) {
      this.session.notifyWorkflowStep(input.featureId, step);
    }

    // 3. Mark step 1 running, tag the in-flight first turn's
    //    messages with its id, then wait for turn completion.
    const firstStep = steps[0];
    if (!(await this.claim(firstStep.id))) return this.stopUnclaimed(input.featureId, firstStep.id);
    this.session.notifyWorkflowStep(input.featureId, await this.refreshStep(firstStep.id));
    this.session.setActiveStep(input.featureId, firstStep.id);

    // Usage baseline captured AFTER the first send has booted the
    // session row (so the row exists and its counters are at zero
    // for this fresh session). We diff this against the snapshot
    // taken when the step finishes to attribute tokens + cost to
    // this step alone.
    const firstStepUsageBefore = await this.snapshotUsage(sessionId);

    try {
      await firstTurnDone;
      const firstStepUsageAfter = await this.snapshotUsage(sessionId);
      await this.stepRepo.updateStatus(firstStep.id, WorkflowStepStatus.done, {
        summary: firstStepDef.title,
        ...this.diffUsage(firstStepUsageBefore, firstStepUsageAfter),
      });
      this.session.notifyWorkflowStep(input.featureId, await this.refreshStep(firstStep.id));
    } catch (err) {
      await this.stepRepo.updateStatus(firstStep.id, WorkflowStepStatus.failed, {
        error: err instanceof Error ? err.message : String(err),
      });
      this.session.notifyWorkflowStep(input.featureId, await this.refreshStep(firstStep.id));
      this.session.clearActiveStep(input.featureId);
      // Rethrow: a failed step is a failed workflow, never `{ completed: true }`.
      throw err;
    }
    this.session.clearActiveStep(input.featureId);

    // 4. Walk remaining steps sequentially.
    for (let i = 1; i < steps.length; i++) {
      const step = steps[i];
      const definition = input.workflow.steps[i];

      if (step.status === WorkflowStepStatus.done) continue;
      if (!(await this.claim(step.id))) return this.stopUnclaimed(input.featureId, step.id);
      this.session.notifyWorkflowStep(input.featureId, await this.refreshStep(step.id));
      this.session.setActiveStep(input.featureId, step.id);

      const turnDone = this.session.waitForTurnDone(input.featureId);
      turnDone.catch(() => undefined);
      const usageBefore = await this.snapshotUsage(sessionId);

      try {
        await this.sendMessage.execute({
          featureId: input.featureId,
          content: definition.prompt,
          worktreePath: input.worktreePath,
          model: input.model,
          agentType: input.agentType,
        });
        await turnDone;

        const usageAfter = await this.snapshotUsage(sessionId);
        await this.stepRepo.updateStatus(step.id, WorkflowStepStatus.done, {
          summary: definition.title,
          ...this.diffUsage(usageBefore, usageAfter),
        });
        this.session.notifyWorkflowStep(input.featureId, await this.refreshStep(step.id));
      } catch (err) {
        await this.stepRepo.updateStatus(step.id, WorkflowStepStatus.failed, {
          error: err instanceof Error ? err.message : String(err),
        });
        this.session.notifyWorkflowStep(input.featureId, await this.refreshStep(step.id));
        throw err;
      } finally {
        this.session.clearActiveStep(input.featureId);
      }
    }
    return { completed: true };
  }

  /** Guarded `pending → running`: true only for the walker that moved the step. */
  private claim(stepId: string): Promise<boolean> {
    return this.stepRepo.updateStatus(stepId, WorkflowStepStatus.running, undefined, CLAIMABLE);
  }

  /** The step was no longer `pending`: another walker owns it, or it needs a retry. */
  private stopUnclaimed(featureId: string, stepId: string): RunWorkflowResult {
    this.logger.info('[run-workflow] step not claimable; leaving the rest to its owner', {
      featureId,
      stepId,
    });
    return { completed: false };
  }

  /**
   * Poll `getChatState` for a short window to resolve the session
   * id of the session we just booted. This is a hot path that
   * runs once per workflow — tens to low hundreds of ms typically.
   */
  private async resolveSessionId(featureId: string): Promise<string | null> {
    for (let attempt = 0; attempt < 50; attempt++) {
      const chat = await this.session.getChatState(featureId);
      const id = chat.sessionInfo?.sessionId ?? null;
      if (id) return id;
      await new Promise((r) => setTimeout(r, 50));
    }
    return null;
  }

  /**
   * Capture the session's cumulative cost/token totals at a point
   * in time. Returns zeros when the session row hasn't been written
   * yet (first-ever boot) or when the repo call fails — usage is
   * strictly informational, so we never let a missing snapshot break
   * the workflow lifecycle.
   */
  private async snapshotUsage(sessionId: string): Promise<UsageSnapshot> {
    try {
      const usage = await this.sessionRepoForUsage.getUsage(sessionId);
      if (!usage) return { ...ZERO_USAGE };
      return {
        costUsd: usage.totalCostUsd ?? 0,
        inputTokens: usage.totalInputTokens ?? 0,
        outputTokens: usage.totalOutputTokens ?? 0,
      };
    } catch {
      return { ...ZERO_USAGE };
    }
  }

  /**
   * Diff two usage snapshots and return the values attributable to
   * the step that ran between them. Negative diffs clamp to zero so
   * a race between two session reads can never surface a negative
   * cost in the UI.
   */
  private diffUsage(
    before: UsageSnapshot,
    after: UsageSnapshot
  ): { costUsd: number; inputTokens: number; outputTokens: number } {
    return {
      costUsd: Math.max(0, after.costUsd - before.costUsd),
      inputTokens: Math.max(0, after.inputTokens - before.inputTokens),
      outputTokens: Math.max(0, after.outputTokens - before.outputTokens),
    };
  }

  private async refreshStep(stepId: string): Promise<WorkflowStep> {
    const row = await this.stepRepo.findById(stepId);
    if (!row) throw new Error(`Workflow step ${stepId} vanished`);
    return row;
  }
}
