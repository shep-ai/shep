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
import type { Application } from '../../../domain/generated/output.js';
import { ApplicationStatus } from '../../../domain/generated/output.js';
import type { IApplicationRepository } from '../../ports/output/repositories/application-repository.interface.js';
import type { IApplicationCreationPromptBuilder } from '../../ports/output/services/application-creation-prompt-builder.interface.js';
import type { IApplicationBriefStore } from '../../ports/output/services/application-brief-store.interface.js';
import type { CreateProjectUseCase } from '../projects/create-project.use-case.js';
import type { SendInteractiveMessageUseCase } from '../interactive/send-interactive-message.use-case.js';
import type { RunWorkflowUseCase } from '../workflows/run-workflow.use-case.js';
import type { IInteractiveSessionRepository } from '../../ports/output/repositories/interactive-session-repository.interface.js';
import { APPLICATION_CREATION_WORKFLOW } from '../../workflows/application-creation.workflow.js';

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
    private readonly sessionRepo: IInteractiveSessionRepository
  ) {}

  async execute(input: CreateApplicationInput): Promise<CreateApplicationResult> {
    // 1. Derive a stable slug stem from the description.
    const baseSlug = slugify(input.description);

    // 2. Allocate a unique <stem>-<6hex> slug + scaffold the project folder.
    const { slug, projectPath } = await this.allocateUniqueSlugAndScaffold(baseSlug);

    // 3. Generate the human-readable display name from the BASE slug
    const name = toTitleCase(baseSlug);

    // 4. Create Application record
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

    // 5. Optionally kick off the interactive chat session.
    //
    //    Prompt delivery strategy — CRITICAL:
    //    The Claude Agent SDK V2 session API (`unstable_v2_createSession`)
    //    uses `SDKSessionOptions`, which does NOT include a `systemPrompt`
    //    field — anything we pass there is silently dropped. V1 `query()`
    //    supports `systemPrompt` but sacrifices the persistent-process
    //    performance V2 gives us, so we stay on V2.
    //
    //    To actually deliver the Shep brief (persona, workflow, quality
    //    bar, definition of done) we:
    //      1. Build the full brief via the prompt builder.
    //      2. Write it to `<SHEP_HOME>/application-briefs/<id>.md`
    //         via IApplicationBriefStore. The brief lives OUTSIDE the
    //         user's project on purpose: keeps the scaffolded repo
    //         clean, survives project-folder recreation, is auditable
    //         per application, and test-isolates via `SHEP_HOME`.
    //      3. Persist the user's verbatim description as the first chat
    //         message (clean UI — no prompt clutter).
    //      4. Kick off the interactive session with a short directive
    //         that (a) carries the user's request and (b) tells the
    //         agent its very first action must be to `Read` the brief
    //         at its absolute path. That read becomes turn 1 of the
    //         conversation history, so every subsequent turn is
    //         conditioned on the full brief.
    if (input.initialPrompt?.trim()) {
      const { systemPrompt, userMessage } = this.promptBuilder.build({
        description: input.initialPrompt.trim(),
        workspace: {
          workingDirectory: projectPath,
          platform: process.platform === 'win32' ? 'windows' : 'posix',
        },
      });

      // 5a. Materialise the brief on disk. The brief holds the
      //     persona/environment/quality bar only — the workflow
      //     steps live in core code, not the brief, because the
      //     orchestrator drives them step by step.
      const briefPath = await this.briefStore.write(application.id, systemPrompt);

      // 5b. Start the orchestrator in the background. The use case
      //     returns immediately — the HTTP/CLI caller isn't blocked
      //     for the 10+ minutes a full build takes. The orchestrator
      //     will:
      //
      //       1. Boot the interactive session via `sendMessage`,
      //          using step 1's prompt wrapped with the "read the
      //          brief first" directive so the agent's turn 1
      //          loads the brief.
      //       2. Walk every step in order, persisting status
      //          transitions BEFORE and AFTER each agent turn so
      //          a refresh or crash always sees a consistent view.
      //
      //     We also persist the user's verbatim description as the
      //     first chat bubble by letting `sendMessage` write it —
      //     that happens inside the orchestrator via
      //     `content: userMessage` on the first step.
      const featureId = `app-${application.id}`;
      void this.dispatchWorkflow({
        featureId,
        worktreePath: projectPath,
        userMessage,
        briefPath,
        model: input.modelOverride,
        agentType: input.agentType,
      });
    }

    return { application, repositoryPath: projectPath };
  }

  /**
   * Kick off the orchestrator asynchronously. Resolves the session
   * id by booting it via the first step's send, then runs the rest
   * of the workflow. Errors are logged — the application is
   * already persisted, so the chat can recover even if the
   * workflow dies.
   */
  private async dispatchWorkflow(args: {
    featureId: string;
    worktreePath: string;
    userMessage: string;
    briefPath: string;
    model?: string;
    agentType?: string;
  }): Promise<void> {
    try {
      await this.runWorkflow.execute({
        featureId: args.featureId,
        worktreePath: args.worktreePath,
        workflow: APPLICATION_CREATION_WORKFLOW,
        model: args.model,
        agentType: args.agentType,
        firstStepPromptWrapper: (stepPrompt) =>
          buildKickoffDirective({
            briefPath: args.briefPath,
            userMessage: `${args.userMessage}\n\n---\n\n${stepPrompt}`,
          }),
        visibleFirstMessage: args.userMessage,
      });

      // All steps completed — mark the application as setup complete
      // and persist the agent session ID for future resumption.
      const appId = args.featureId.replace(/^app-/, '');
      const agentSessionId = await this.sessionRepo.findLatestAgentSessionIdForFeature(
        args.featureId
      );
      await this.appRepo.update(appId, {
        setupComplete: true,
        ...(agentSessionId ? { agentSessionId } : {}),
      });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[create-application] workflow dispatch failed:', err);
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
