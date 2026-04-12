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
 *      steps and fails fast on any `running`/`interrupted`/`failed`
 *      row (user retry flow can reset them to `pending`).
 */

import { injectable, inject } from 'tsyringe';
import type { IWorkflowStepRepository } from '../../ports/output/repositories/workflow-step-repository.interface.js';
import type { IInteractiveSessionService } from '../../ports/output/services/interactive-session-service.interface.js';
import type { SendInteractiveMessageUseCase } from '../interactive/send-interactive-message.use-case.js';
import { WorkflowStepStatus, type WorkflowStep } from '../../../domain/generated/output.js';
import type { WorkflowDefinition } from '../../workflows/application-creation.workflow.js';

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
}

@injectable()
export class RunWorkflowUseCase {
  constructor(
    @inject('IWorkflowStepRepository')
    private readonly stepRepo: IWorkflowStepRepository,
    @inject('IInteractiveSessionService')
    private readonly session: IInteractiveSessionService,
    @inject('SendInteractiveMessageUseCase')
    private readonly sendMessage: SendInteractiveMessageUseCase
  ) {}

  async execute(input: RunWorkflowInput): Promise<void> {
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
    if (!firstStepDef) return;

    // Subscribe before sending to avoid racing a fast first turn.
    const firstTurnDone = this.session.waitForTurnDone(input.featureId);

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
    });

    // Resolve the session id — newly booted, so poll briefly.
    const sessionId = await this.resolveSessionId(input.featureId);
    if (!sessionId) {
      // eslint-disable-next-line no-console
      console.warn(`[run-workflow] no session id for ${input.featureId}`);
      return;
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
    await this.stepRepo.updateStatus(firstStep.id, WorkflowStepStatus.running);
    this.session.notifyWorkflowStep(input.featureId, await this.refreshStep(firstStep.id));
    this.session.setActiveStep(input.featureId, firstStep.id);

    try {
      await firstTurnDone;
      await this.stepRepo.updateStatus(firstStep.id, WorkflowStepStatus.done, {
        summary: firstStepDef.title,
      });
      this.session.notifyWorkflowStep(input.featureId, await this.refreshStep(firstStep.id));
    } catch (err) {
      await this.stepRepo.updateStatus(firstStep.id, WorkflowStepStatus.failed, {
        error: err instanceof Error ? err.message : String(err),
      });
      this.session.notifyWorkflowStep(input.featureId, await this.refreshStep(firstStep.id));
      this.session.clearActiveStep(input.featureId);
      return;
    }
    this.session.clearActiveStep(input.featureId);

    // 4. Walk remaining steps sequentially.
    for (let i = 1; i < steps.length; i++) {
      const step = steps[i];
      const definition = input.workflow.steps[i];

      if (step.status === WorkflowStepStatus.done) continue;
      if (step.status !== WorkflowStepStatus.pending) return;

      await this.stepRepo.updateStatus(step.id, WorkflowStepStatus.running);
      this.session.notifyWorkflowStep(input.featureId, await this.refreshStep(step.id));
      this.session.setActiveStep(input.featureId, step.id);

      const turnDone = this.session.waitForTurnDone(input.featureId);

      try {
        await this.sendMessage.execute({
          featureId: input.featureId,
          content: definition.prompt,
          worktreePath: input.worktreePath,
          model: input.model,
          agentType: input.agentType,
        });
        await turnDone;

        await this.stepRepo.updateStatus(step.id, WorkflowStepStatus.done, {
          summary: definition.title,
        });
        this.session.notifyWorkflowStep(input.featureId, await this.refreshStep(step.id));
      } catch (err) {
        await this.stepRepo.updateStatus(step.id, WorkflowStepStatus.failed, {
          error: err instanceof Error ? err.message : String(err),
        });
        this.session.notifyWorkflowStep(input.featureId, await this.refreshStep(step.id));
        return;
      } finally {
        this.session.clearActiveStep(input.featureId);
      }
    }
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

  private async refreshStep(stepId: string): Promise<WorkflowStep> {
    const row = await this.stepRepo.findById(stepId);
    if (!row) throw new Error(`Workflow step ${stepId} vanished`);
    return row;
  }
}
