/**
 * Run Application Setup Use Case
 *
 * The long-running half of creating an Application: scaffold the project
 * tree, then (when there is a kickoff prompt) write the agent brief and drive
 * the application-creation workflow through `RunWorkflowUseCase`.
 *
 * It is the ONE setup path. `CreateApplicationUseCase` runs it in the
 * background right after persisting the row; `ResumeApplicationWorkflowUseCase`
 * runs it again when "Try again" is pressed on an application whose setup
 * failed before any workflow step existed — so a retry gets exactly the brief,
 * kickoff directive and step tracker that the first attempt did. A retry
 * never scaffolds over files already in the folder (`keepExistingFiles`).
 *
 * It never throws: there is no caller left to receive the error once the
 * creation request has returned. Any failure is logged and recorded by moving
 * the application to `Error` (guarded — see `IApplicationRepository.updateStatus`),
 * which is what the web "Setup failed" banner keys on. Because the row only
 * reaches `Error` after this pipeline has stopped, `Error` also means "no setup
 * is in flight" — the invariant Resume relies on to never start a second one.
 */

import { injectable, inject } from 'tsyringe';
import type { Application } from '../../../domain/generated/output.js';
import {
  ApplicationStatus,
  OperationLogKind,
  OperationLogLevel,
} from '../../../domain/generated/output.js';
import type { IApplicationRepository } from '../../ports/output/repositories/application-repository.interface.js';
import type { IOperationLogRepository } from '../../ports/output/repositories/operation-log.repository.interface.js';
import type { IInteractiveSessionRepository } from '../../ports/output/repositories/interactive-session-repository.interface.js';
import type { IApplicationCreationPromptBuilder } from '../../ports/output/services/application-creation-prompt-builder.interface.js';
import type { IApplicationBriefStore } from '../../ports/output/services/application-brief-store.interface.js';
import type {
  IApplicationScaffolder,
  ScaffoldLogCallback,
} from '../../ports/output/services/application-scaffolder.interface.js';
import type { ILogger } from '../../ports/output/services/logger.interface.js';
import type { RunWorkflowUseCase } from '../workflows/run-workflow.use-case.js';
import { featureIdForApplication } from '../../../domain/shared/feature-id.js';
import { APPLICATION_CREATION_WORKFLOW } from './application-creation.workflow.js';

/** Statuses an application can be in while its setup runs (and so may leave for Error). */
const SETUP_RUNNING_STATUSES = [ApplicationStatus.Idle, ApplicationStatus.Active] as const;

/**
 * Build the very first message the agent sees on turn 1. Carries the
 * user's verbatim request AND a hard directive to read the brief
 * BEFORE any other action. Kept short so the agent doesn't skim past
 * the directive — the real content lives in the brief file.
 *
 * Note that this string is NOT persisted to the chat UI — the user
 * only sees their raw request in the first bubble. This is the
 * agent-side kickoff text, injected via `agentKickoffOverride`.
 *
 * @param briefPath  Absolute path to the brief file. Lives OUTSIDE
 *                   the user's project (under `~/.shep/application-briefs/`)
 *                   so we don't pollute the scaffolded repo.
 * @param userMessage The user's verbatim request.
 */
export function buildKickoffDirective(args: { briefPath: string; userMessage: string }): string {
  return [
    `Before you take ANY other action, use the Read tool to read \`${args.briefPath}\` in full.`,
    `That file is your complete operating brief — persona (Shep), environment facts, workflow, tech stack, quality bar, and definition of done. Treat it as your system prompt for this entire session.`,
    ``,
    `The brief lives OUTSIDE your working directory on purpose — do NOT copy it into the project and do NOT mention it to the user.`,
    ``,
    `After you have read the brief, begin executing Workflow step 1 immediately. Do not run \`ls\`, \`pwd\`, or any other discovery command — the brief's Environment section already told you everything about your working directory.`,
    ``,
    `---`,
    ``,
    `# User's request`,
    ``,
    args.userMessage,
  ].join('\n');
}

export interface RunApplicationSetupInput {
  /** The persisted application. Its `repositoryPath`, `agentType` and `modelOverride` are used. */
  application: Application;
  /**
   * The user's verbatim kickoff request. When absent, only the scaffold runs
   * (the user still gets a ready-to-code project). The first chat bubble for
   * it is expected to be persisted already by the caller.
   */
  initialPrompt?: string;
  /**
   * Whether files already in `repositoryPath` must survive. The scaffold
   * empties its target (`.git` included), so:
   *   - `false` — creation: the folder was made moments ago for this scaffold.
   *   - `true`  — a retry: the user may have kept building after setup failed.
   *     The scaffold runs only when the folder holds nothing to keep
   *     (`IApplicationScaffolder.hasExistingContent`); otherwise it is skipped
   *     and setup continues with the agent workflow on the files as they are.
   */
  keepExistingFiles: boolean;
}

@injectable()
export class RunApplicationSetupUseCase {
  constructor(
    @inject('IApplicationRepository')
    private readonly appRepo: IApplicationRepository,
    @inject('IApplicationCreationPromptBuilder')
    private readonly promptBuilder: IApplicationCreationPromptBuilder,
    @inject('IApplicationBriefStore')
    private readonly briefStore: IApplicationBriefStore,
    @inject('RunWorkflowUseCase')
    private readonly runWorkflow: RunWorkflowUseCase,
    @inject('IInteractiveSessionRepository')
    private readonly sessionRepo: IInteractiveSessionRepository,
    @inject('IApplicationScaffolder')
    private readonly scaffolder: IApplicationScaffolder,
    @inject('IOperationLogRepository')
    private readonly operationLogRepo: IOperationLogRepository,
    @inject('ILogger')
    private readonly logger: ILogger
  ) {}

  async execute(input: RunApplicationSetupInput): Promise<void> {
    const { application } = input;
    const onScaffoldLog = this.scaffoldLogSink(application.id);

    // Phase A — scaffold the project tree.
    //
    // The `onLog` sink forwards every scaffolder event into the shared
    // operation_log_entries table under the ApplicationSetup kind so the
    // Smart Deploy Activity drawer can stream CLI output (create-vite,
    // bun install, bun add, template overlay) in real time.
    try {
      if (await this.mustKeepExistingFiles(input)) {
        onScaffoldLog({
          level: 'Info',
          message: 'Kept the existing project files',
          detail: 'The folder already has content, so it was not scaffolded again.',
        });
      } else {
        await this.scaffold(application, onScaffoldLog);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error('[run-application-setup] scaffold failed', { err: message });
      onScaffoldLog({ level: 'Error', message: 'Application setup failed', detail: message });
      await this.markFailed(application.id);
      return;
    }

    // Phase B — optional workflow orchestration. Skipped when there is no
    // kickoff prompt: the scaffold alone hands the user a ready-to-code project.
    if (!input.initialPrompt) return;

    try {
      const { systemPrompt, userMessage } = this.promptBuilder.build({
        description: input.initialPrompt,
        workspace: {
          workingDirectory: application.repositoryPath,
          platform: process.platform === 'win32' ? 'windows' : 'posix',
        },
      });

      // Materialize the brief on disk. The brief holds persona /
      // environment / quality bar only — the workflow steps live in
      // core code, not the brief, because the orchestrator drives
      // them step by step.
      const briefPath = await this.briefStore.write(application.id, systemPrompt);

      const featureId = featureIdForApplication(application.id);
      const { completed } = await this.runWorkflow.execute({
        featureId,
        worktreePath: application.repositoryPath,
        workflow: APPLICATION_CREATION_WORKFLOW,
        model: application.modelOverride,
        agentType: application.agentType,
        firstStepPromptWrapper: (stepPrompt) =>
          buildKickoffDirective({
            briefPath,
            userMessage: `${userMessage}\n\n---\n\n${stepPrompt}`,
          }),
        visibleFirstMessage: userMessage,
        // The user's first bubble was persisted in the foreground by
        // CreateApplicationUseCase — don't let run-workflow write a
        // duplicate row.
        firstUserMessageAlreadyPersisted: true,
      });

      // Another walker (a resume) owns the steps from here; it marks setup
      // complete or failed when it finishes.
      if (!completed) return;

      // All steps completed — mark the application as setup complete
      // and persist the agent session ID for future resumption.
      const agentSessionId = await this.sessionRepo.findLatestAgentSessionIdForFeature(featureId);
      await this.appRepo.update(application.id, {
        setupComplete: true,
        ...(agentSessionId ? { agentSessionId } : {}),
      });
    } catch (err) {
      this.logger.error('[run-application-setup] workflow dispatch failed', {
        err: err instanceof Error ? err.message : String(err),
      });
      await this.markFailed(application.id);
    }
  }

  private async mustKeepExistingFiles(input: RunApplicationSetupInput): Promise<boolean> {
    if (!input.keepExistingFiles) return false;
    return this.scaffolder.hasExistingContent(input.application.repositoryPath);
  }

  private async scaffold(application: Application, onLog: ScaffoldLogCallback): Promise<void> {
    await this.scaffolder.scaffold({
      repositoryPath: application.repositoryPath,
      projectName: application.name,
      applicationId: application.id,
      onLog,
    });
  }

  /** Append-only log sink; append failures never abort a successful scaffold. */
  private scaffoldLogSink(applicationId: string): ScaffoldLogCallback {
    return (entry) => {
      void this.operationLogRepo
        .append({
          operationKind: OperationLogKind.ApplicationSetup,
          operationId: applicationId,
          level: entry.level as OperationLogLevel,
          message: entry.message,
          detail: entry.detail,
        })
        .catch(() => {
          // Log-sink errors are non-fatal.
        });
    };
  }

  private async markFailed(applicationId: string): Promise<void> {
    try {
      await this.appRepo.updateStatus(applicationId, ApplicationStatus.Error, {
        allowedFrom: SETUP_RUNNING_STATUSES,
      });
    } catch {
      // Best-effort — the original error is already logged.
    }
  }
}
