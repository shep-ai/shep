/**
 * Create Application Use Case
 *
 * End-to-end "user clicked Create": derives a unique slug, scaffolds the
 * project folder via CreateProjectUseCase, persists a new Application
 * entity, and (optionally) kicks off the interactive agent session by
 * sending the application-creation prompt as the first chat message.
 *
 * Composing the prompt + first-message dispatch in this use case keeps
 * the presentation layer free of orchestration logic and lets every
 * surface (Web, CLI, TUI) get the same behavior from a single call.
 */

import { injectable, inject } from 'tsyringe';
import { randomUUID, randomBytes } from 'node:crypto';
import type { Application, InteractiveMessage } from '../../../domain/generated/output.js';
import {
  ApplicationStatus,
  InteractiveMessageRole,
  OperationLogKind,
  OperationLogLevel,
} from '../../../domain/generated/output.js';
import type { IApplicationRepository } from '../../ports/output/repositories/application-repository.interface.js';
import type { IOperationLogRepository } from '../../ports/output/repositories/operation-log.repository.interface.js';
import type { IApplicationCreationPromptBuilder } from '../../ports/output/services/application-creation-prompt-builder.interface.js';
import type { IApplicationBriefStore } from '../../ports/output/services/application-brief-store.interface.js';
import type { IApplicationScaffolder } from '../../ports/output/services/application-scaffolder.interface.js';
import type { IInteractiveMessageRepository } from '../../ports/output/repositories/interactive-message-repository.interface.js';
import type { ILogger } from '../../ports/output/services/logger.interface.js';
import type { CreateProjectUseCase } from '../projects/create-project.use-case.js';
import type { SendInteractiveMessageUseCase } from '../interactive/send-interactive-message.use-case.js';
import type { RunWorkflowUseCase } from '../workflows/run-workflow.use-case.js';
import type { IInteractiveSessionRepository } from '../../ports/output/repositories/interactive-session-repository.interface.js';
import { featureIdForApplication } from '../../../domain/shared/feature-id.js';
import { APPLICATION_CREATION_WORKFLOW } from './application-creation.workflow.js';

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

export interface CreateApplicationInput {
  description: string;
  agentType?: string;
  modelOverride?: string;
  /**
   * When set, the use case ALSO sends this as the first message of the
   * application's interactive chat session, wrapped with the full
   * application-creation prompt (Shep persona, mission, tech stack,
   * workflow, quality bar, definition of done). Pass the user's verbatim
   * request — wrapping happens internally via the injected prompt builder.
   */
  initialPrompt?: string;
}

export interface CreateApplicationResult {
  application: Application;
  repositoryPath: string;
}

/** Stop words stripped when building the application slug. */
const STOP_WORDS = new Set([
  'a',
  'an',
  'the',
  'and',
  'or',
  'but',
  'with',
  'for',
  'in',
  'on',
  'to',
  'of',
  'is',
  'it',
  'that',
  'this',
  'my',
  'our',
  'your',
  'me',
  'i',
  'build',
  'create',
  'make',
  'add',
  'implement',
  'develop',
  'write',
]);

function slugify(description: string): string {
  const words = description
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .split(/\s+/)
    .filter((w) => w.length > 0 && !STOP_WORDS.has(w));

  const slug = words.slice(0, 5).join('-');
  return slug || 'application';
}

function toTitleCase(slug: string): string {
  return slug
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/**
 * 6-character lowercase hex tag (~16M combinations). Appended to every
 * application slug so each one is unique on disk and in the DB without
 * needing a sequential lookup-and-retry against existing rows. Random
 * also avoids the failure mode where a stale folder (left over from a
 * deleted DB row) blocks recreation under the same description.
 *
 * Exported for unit testing.
 */
export function randomSlugTag(): string {
  return randomBytes(3).toString('hex');
}

@injectable()
export class CreateApplicationUseCase {
  constructor(
    @inject('IApplicationRepository')
    private readonly appRepo: IApplicationRepository,
    @inject('CreateProjectUseCase')
    private readonly createProject: CreateProjectUseCase,
    @inject('IApplicationCreationPromptBuilder')
    private readonly promptBuilder: IApplicationCreationPromptBuilder,
    @inject('SendInteractiveMessageUseCase')
    private readonly sendMessage: SendInteractiveMessageUseCase,
    @inject('IApplicationBriefStore')
    private readonly briefStore: IApplicationBriefStore,
    @inject('RunWorkflowUseCase')
    private readonly runWorkflow: RunWorkflowUseCase,
    @inject('IInteractiveSessionRepository')
    private readonly sessionRepo: IInteractiveSessionRepository,
    @inject('IApplicationScaffolder')
    private readonly scaffolder: IApplicationScaffolder,
    @inject('IInteractiveMessageRepository')
    private readonly messageRepo: IInteractiveMessageRepository,
    @inject('IOperationLogRepository')
    private readonly operationLogRepo: IOperationLogRepository,
    @inject('ILogger')
    private readonly logger: ILogger
  ) {}

  async execute(input: CreateApplicationInput): Promise<CreateApplicationResult> {
    // 1. Derive a stable slug stem from the description.
    const baseSlug = slugify(input.description);

    // 2. Allocate a unique <stem>-<6hex> slug + create the empty project folder.
    const { slug, projectPath } = await this.allocateUniqueSlugAndScaffold(baseSlug);

    // 3. Generate the human-readable display name from the BASE slug
    const name = toTitleCase(baseSlug);

    // 4. Persist the Application row IMMEDIATELY and return to the caller.
    //
    //    CRITICAL — DO NOT MOVE THE SCAFFOLD ABOVE THIS LINE.
    //    The scaffold pipeline (`bun --version` → `npm install -g bun`
    //    → `bunx shadcn init` → flatten → `bun add` → template overlay)
    //    takes 30+ seconds on the first run and blocks whichever
    //    runtime is calling us (Next.js server action, CLI, future
    //    TUI). A previous regression awaited it inline and every
    //    presentation layer froze for the duration. Every caller
    //    MUST see a fast return here and navigate the user to the
    //    application page while scaffolding runs in the background.
    //
    //    Row goes in with status = Idle / setupComplete = false. The
    //    background dispatch below will:
    //      1. Run the scaffold (deterministic, no agent).
    //      2. On success, dispatch the orchestrator workflow if
    //         there is an initialPrompt.
    //      3. On any failure, flip status to Error so the
    //         application card surfaces the problem on the page.
    const now = new Date();
    const application: Application = {
      id: randomUUID(),
      name,
      slug,
      description: input.description,
      repositoryPath: projectPath,
      additionalPaths: [],
      status: ApplicationStatus.Idle,
      setupComplete: false,
      agentType: input.agentType,
      modelOverride: input.modelOverride,
      createdAt: now,
      updatedAt: now,
    };
    await this.appRepo.create(application);

    // 4b. Persist the user's verbatim description as the first chat
    //     message IMMEDIATELY, while we're still in the foreground.
    //     The chat page SSR reads messages via
    //     `InteractiveMessageRepository.findByFeatureId` on first
    //     paint, so writing the row here means the user sees their
    //     own bubble the instant they land on `/application/<id>` —
    //     no waiting for the 30-second scaffold + session boot to
    //     finish before the background workflow dispatch gets around
    //     to calling `sendMessage.execute`.
    //
    //     The background workflow dispatch below passes
    //     `firstUserMessageAlreadyPersisted: true` so `RunWorkflowUseCase`
    //     skips the DB-persist side of its first `sendMessage.execute`
    //     call — only the session boot + agent kickoff run, no
    //     duplicate row.
    if (input.initialPrompt?.trim()) {
      const now2 = new Date();
      const firstUserMessage: InteractiveMessage = {
        id: randomUUID(),
        featureId: featureIdForApplication(application.id),
        role: InteractiveMessageRole.user,
        content: input.initialPrompt.trim(),
        createdAt: now2,
        updatedAt: now2,
      };
      try {
        await this.messageRepo.create(firstUserMessage);
      } catch (err) {
        // Non-fatal — the background dispatch will retry via
        // sendMessage.execute if the row is missing. The user will
        // still see their bubble a few seconds later instead of
        // instantly. We log and continue so the application row
        // and project path are still returned to the caller.
        this.logger.error('[create-application] failed to pre-persist first user message', {
          err: err instanceof Error ? err.message : String(err),
        });
      }
    }

    // 5. Kick off scaffold + (optional) workflow in the background.
    //    The use case returns IMMEDIATELY after this fire-and-forget;
    //    the HTTP / CLI caller is unblocked in milliseconds and the
    //    user lands on the application page right away.
    //
    //    If initialPrompt is set, the workflow orchestrator runs
    //    after the scaffold finishes. If initialPrompt is absent
    //    (e.g. `shep app new` without a kickoff), only the scaffold
    //    runs — the user still gets a ready-to-code project.
    //
    //    Prompt delivery strategy — CRITICAL (unchanged from before):
    //    The Claude Agent SDK V2 session API does not accept a
    //    systemPrompt, so we write the full brief to
    //    `<SHEP_HOME>/application-briefs/<id>.md` via
    //    IApplicationBriefStore and have the agent Read it on turn 1
    //    via a kickoff directive. Building the brief and writing it
    //    also runs in the background so the request handler stays
    //    fast.
    void this.dispatchScaffoldAndWorkflow({
      application,
      projectPath,
      initialPrompt: input.initialPrompt?.trim() ? input.initialPrompt.trim() : undefined,
      agentType: input.agentType,
      modelOverride: input.modelOverride,
    });

    return { application, repositoryPath: projectPath };
  }

  /**
   * Background pipeline that runs AFTER the Application row is
   * already persisted and the caller has returned. Owns the long-
   * running side effects (scaffold, optional workflow) so no
   * presentation layer has to block on them.
   *
   * Errors at any stage are caught and flip the Application row to
   * Error + setupComplete=false — never re-thrown, because there is
   * no caller left to receive them.
   */
  private async dispatchScaffoldAndWorkflow(args: {
    application: Application;
    projectPath: string;
    initialPrompt: string | undefined;
    agentType: string | undefined;
    modelOverride: string | undefined;
  }): Promise<void> {
    // Phase A — scaffold the project tree.
    //
    // Wire an `onLog` sink that forwards every scaffolder event into
    // the shared operation_log_entries table under the ApplicationSetup
    // kind so the Smart Deploy Activity drawer can stream CLI output
    // (create-vite, bun install, bun add, template overlay) in real
    // time. Append failures are intentionally swallowed — a broken
    // log sink must never abort a successful scaffold.
    const appId = args.application.id;
    const onScaffoldLog = (entry: {
      level: 'Debug' | 'Info' | 'Warn' | 'Error';
      message: string;
      detail?: string;
    }): void => {
      void this.operationLogRepo
        .append({
          operationKind: OperationLogKind.ApplicationSetup,
          operationId: appId,
          level: entry.level as OperationLogLevel,
          message: entry.message,
          detail: entry.detail,
        })
        .catch(() => {
          // Log-sink errors are non-fatal.
        });
    };

    try {
      await this.scaffolder.scaffold({
        repositoryPath: args.projectPath,
        projectName: args.application.name,
        applicationId: args.application.id,
        onLog: onScaffoldLog,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error('[create-application] scaffold failed', { err: message });
      onScaffoldLog({
        level: 'Error',
        message: 'Application setup failed',
        detail: message,
      });
      try {
        await this.appRepo.update(args.application.id, {
          status: ApplicationStatus.Error,
        });
      } catch {
        // Best-effort — surface the original error first.
      }
      return;
    }

    // Phase B — optional workflow orchestration. Skipped when no
    // initialPrompt is provided (e.g. `shep app new` without a
    // kickoff). The scaffold alone is enough to hand the user a
    // ready-to-code project.
    if (!args.initialPrompt) return;

    try {
      const { systemPrompt, userMessage } = this.promptBuilder.build({
        description: args.initialPrompt,
        workspace: {
          workingDirectory: args.projectPath,
          platform: process.platform === 'win32' ? 'windows' : 'posix',
        },
      });

      // Materialize the brief on disk. The brief holds persona /
      // environment / quality bar only — the workflow steps live in
      // core code, not the brief, because the orchestrator drives
      // them step by step.
      const briefPath = await this.briefStore.write(args.application.id, systemPrompt);

      const featureId = featureIdForApplication(args.application.id);
      await this.runWorkflow.execute({
        featureId,
        worktreePath: args.projectPath,
        workflow: APPLICATION_CREATION_WORKFLOW,
        model: args.modelOverride,
        agentType: args.agentType,
        firstStepPromptWrapper: (stepPrompt) =>
          buildKickoffDirective({
            briefPath,
            userMessage: `${userMessage}\n\n---\n\n${stepPrompt}`,
          }),
        visibleFirstMessage: userMessage,
        // The user's first bubble was pre-persisted in execute()
        // before this background dispatch ran — don't let run-workflow
        // write a duplicate row.
        firstUserMessageAlreadyPersisted: true,
      });

      // All steps completed — mark the application as setup complete
      // and persist the agent session ID for future resumption.
      const agentSessionId = await this.sessionRepo.findLatestAgentSessionIdForFeature(featureId);
      await this.appRepo.update(args.application.id, {
        setupComplete: true,
        ...(agentSessionId ? { agentSessionId } : {}),
      });
    } catch (err) {
      this.logger.error('[create-application] workflow dispatch failed', {
        err: err instanceof Error ? err.message : String(err),
      });
      try {
        await this.appRepo.update(args.application.id, {
          status: ApplicationStatus.Error,
        });
      } catch {
        // Best-effort status update — original error already logged.
      }
    }
  }

  /**
   * Generate `<baseSlug>-<random>` candidates until both the DB has no row
   * with that slug AND CreateProjectUseCase reports the folder doesn't
   * exist. Retries up to MAX_ATTEMPTS times before giving up.
   */
  private async allocateUniqueSlugAndScaffold(
    baseSlug: string
  ): Promise<{ slug: string; projectPath: string }> {
    const MAX_ATTEMPTS = 5;
    let lastError: string | undefined;

    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      const candidate = `${baseSlug}-${randomSlugTag()}`;

      const existing = await this.appRepo.findBySlug(candidate);
      if (existing) continue;

      const result = await this.createProject.execute({ name: candidate });
      if (result.ok) {
        return { slug: candidate, projectPath: result.path };
      }
      // Folder already exists (extremely unlikely with random tag) — retry
      // with a fresh random tag.
      lastError = result.error;
    }

    throw new Error(
      lastError ??
        `Failed to allocate a unique slug for "${baseSlug}" after ${MAX_ATTEMPTS} attempts.`
    );
  }
}
