/**
 * HarnessTaskService (spec 119): the one entry point that runs a harness task,
 * shared by the feature-agent executor, standalone runs and evals.
 *
 * It owns what sits around a single HarnessRuntime.runTask call: the session
 * (one per feature AgentRun, or an explicit standalone session), the effective
 * config from settings, the model backend, structured output, and the session
 * status afterwards.
 */
import { randomUUID } from 'node:crypto';
import {
  HarnessEventType,
  HarnessMode,
  HarnessSessionOrigin,
  HarnessSessionStatus,
  type HarnessConfig,
  type HarnessSession,
  type HarnessTask,
  type HarnessTaskResult,
} from '../../../domain/generated/output.js';
import { resolveHarnessConfig } from '../../../domain/harness/harness-config.js';
import { PromptSectionKind, type PromptSection } from '../../../domain/harness/prompt-sections.js';
import type { ISettingsRepository } from '../../ports/output/repositories/settings.repository.interface.js';
import type {
  IHarnessEventLog,
  IHarnessModelProviderFactory,
  IHarnessSessionRepository,
} from '../../ports/output/harness/index.js';
import type { HarnessRuntime } from './harness-runtime.js';
import type { HarnessUsageTotals, ProgressEvent } from './turn-context.js';

/** Longest goal kept from a prompt's first line. */
const MAX_GOAL_CHARS = 300;
const SYSTEM_SECTION_ID = 'system-instructions';
const DEFAULT_TIMEOUT_MS = 30 * 60 * 1000;
const STRUCTURED_SYSTEM =
  'Convert the finished task report into JSON that matches the schema exactly. Use only facts from the report.';

/** Per-run changes to the configured harness behaviour (CLI flags, New task form). */
export interface HarnessRunOverrides {
  mode?: HarnessConfig['mode'];
  budgetMode?: HarnessConfig['budgetMode'];
  maxTurns?: number;
  shadow?: Partial<HarnessConfig['shadow']>;
}

export function applyOverrides(
  config: HarnessConfig,
  overrides: HarnessRunOverrides | undefined
): HarnessConfig {
  if (!overrides) return config;
  return {
    ...config,
    ...(overrides.mode && { mode: overrides.mode }),
    ...(overrides.budgetMode && { budgetMode: overrides.budgetMode }),
    ...(overrides.maxTurns && overrides.maxTurns > 0 && { maxTurns: overrides.maxTurns }),
    shadow: { ...config.shadow, ...(overrides.shadow ?? {}) },
  };
}

export interface ExecuteHarnessTaskInput {
  prompt: string;
  cwd: string;
  /** Bind to (or create) the session of this feature AgentRun. */
  agentRunId?: string;
  featureId?: string;
  phase?: string;
  /** Run inside an existing session (standalone / resume). */
  sessionId?: string;
  goal?: string;
  systemPrompt?: string;
  promptSections?: PromptSection[];
  outputSchema?: object;
  modelId?: string;
  /** Backend credential configured for the shep-harness agent, if any. */
  credential?: string;
  interactive: boolean;
  timeoutMs?: number;
  abortSignal?: AbortSignal;
  testCommand?: string;
  overrides?: HarnessRunOverrides;
  onProgress?: (event: ProgressEvent) => void;
}

export interface ExecuteHarnessTaskResult {
  session: HarnessSession;
  task: HarnessTask;
  result: HarnessTaskResult;
  text: string;
  structured?: unknown;
  usage: HarnessUsageTotals;
}

export interface CreateSessionInput {
  origin: HarnessSessionOrigin;
  repoRoot: string;
  title: string;
  agentRunId?: string;
  featureId?: string;
  sourceRepoPath?: string;
  worktreePath?: string;
  worktreeBranch?: string;
  modelId?: string;
}

/** First non-empty line of a prompt, without Markdown heading marks. */
export function deriveGoal(prompt: string): string {
  const line = prompt
    .split('\n')
    .map((l) => l.replace(/^#+\s*/, '').trim())
    .find((l) => l.length > 0);
  return (line ?? 'Harness task').slice(0, MAX_GOAL_CHARS);
}

export class HarnessTaskService {
  constructor(
    private readonly runtime: HarnessRuntime,
    private readonly sessions: IHarnessSessionRepository,
    private readonly events: IHarnessEventLog,
    private readonly settings: ISettingsRepository,
    private readonly models: IHarnessModelProviderFactory
  ) {}

  async config(overrides?: HarnessRunOverrides): Promise<HarnessConfig> {
    const settings = await this.settings.load();
    return applyOverrides(resolveHarnessConfig(settings?.harness), overrides);
  }

  async createSession(input: CreateSessionInput, config?: HarnessConfig): Promise<HarnessSession> {
    const effective = config ?? (await this.config());
    const now = new Date();
    const session: HarnessSession = {
      id: randomUUID(),
      status: HarnessSessionStatus.Idle,
      origin: input.origin,
      // Shadow context routing executes as baseline and only records query-aware plans.
      mode: effective.shadow.contextRouter ? HarnessMode.Baseline : effective.mode,
      repoRoot: input.repoRoot,
      title: input.title.slice(0, MAX_GOAL_CHARS),
      shadowContext: effective.shadow.contextRouter,
      ...(input.agentRunId && { agentRunId: input.agentRunId }),
      ...(input.featureId && { featureId: input.featureId }),
      ...(input.sourceRepoPath && { sourceRepoPath: input.sourceRepoPath }),
      ...(input.worktreePath && { worktreePath: input.worktreePath }),
      ...(input.worktreeBranch && { worktreeBranch: input.worktreeBranch }),
      ...(input.modelId && { modelId: input.modelId }),
      createdAt: now,
      updatedAt: now,
    };
    await this.sessions.createSession(session);
    await this.events.append({
      sessionId: session.id,
      type: HarnessEventType.SessionCreated,
      payload: { origin: session.origin, mode: session.mode, repoRoot: session.repoRoot },
    });
    return session;
  }

  async updateSession(session: HarnessSession): Promise<void> {
    await this.sessions.updateSession(session);
  }

  async getSession(id: string): Promise<HarnessSession | null> {
    return this.sessions.getSession(id);
  }

  private async resolveSession(
    input: ExecuteHarnessTaskInput,
    config: HarnessConfig
  ): Promise<HarnessSession> {
    if (input.sessionId) {
      const existing = await this.sessions.getSession(input.sessionId);
      if (!existing) throw new Error(`Harness session not found: ${input.sessionId}`);
      return existing;
    }
    if (input.agentRunId) {
      const existing = await this.sessions.findSessionByAgentRun(input.agentRunId);
      if (existing) return existing;
    }
    return this.createSession(
      {
        origin: input.agentRunId ? HarnessSessionOrigin.Feature : HarnessSessionOrigin.Standalone,
        repoRoot: input.cwd,
        title: input.goal ?? deriveGoal(input.prompt),
        ...(input.agentRunId && { agentRunId: input.agentRunId }),
        ...(input.featureId && { featureId: input.featureId }),
        ...(input.modelId && { modelId: input.modelId }),
      },
      config
    );
  }

  async execute(input: ExecuteHarnessTaskInput): Promise<ExecuteHarnessTaskResult> {
    const config = await this.config(input.overrides);
    const session = await this.resolveSession(input, config);
    const modelId = input.modelId ?? session.modelId ?? config.backendModel;
    const model = this.models.create({
      backendAgentType: config.backendAgentType,
      ...(modelId && { modelId }),
      ...(input.credential && { credential: input.credential }),
    });
    const sections = input.promptSections;
    const systemSection: PromptSection | undefined = input.systemPrompt
      ? {
          id: SYSTEM_SECTION_ID,
          title: 'Agent instructions',
          kind: PromptSectionKind.Instructions,
          content: input.systemPrompt,
          pinned: true,
        }
      : undefined;
    const run = await (async () => {
      try {
        return await this.runtime.runTask({
          session,
          goal: input.goal ?? deriveGoal(input.prompt),
          prompt: input.prompt,
          ...((sections ?? systemSection) && {
            promptSections: [...(systemSection ? [systemSection] : []), ...(sections ?? [])],
          }),
          ...(input.phase && { phase: input.phase }),
          cwd: input.cwd,
          repoRoot: session.worktreePath ?? session.repoRoot,
          config,
          model,
          interactive: input.interactive,
          timeoutMs: input.timeoutMs ?? DEFAULT_TIMEOUT_MS,
          ...(input.abortSignal && { abortSignal: input.abortSignal }),
          ...(input.testCommand && { testCommand: input.testCommand }),
          ...(input.onProgress && { onProgress: input.onProgress }),
        });
      } finally {
        await this.markIdle(session.id);
      }
    })();

    if (!input.outputSchema) {
      return { session, task: run.task, result: run.result, text: run.finalText, usage: run.usage };
    }
    const structured = await model.generateObject<unknown>({
      system: STRUCTURED_SYSTEM,
      prompt: `${run.finalText}\n\nResult summary: ${run.result.summary}`,
      schema: input.outputSchema as Record<string, unknown>,
      ...(input.abortSignal && { abortSignal: input.abortSignal }),
    });
    return {
      session,
      task: run.task,
      result: run.result,
      text: JSON.stringify(structured.object),
      structured: structured.object,
      usage: {
        ...run.usage,
        inputTokens: run.usage.inputTokens + (structured.usage.inputTokens ?? 0),
        outputTokens: run.usage.outputTokens + (structured.usage.outputTokens ?? 0),
        costUsd:
          run.usage.costUsd !== undefined && structured.usage.costUsd !== undefined
            ? run.usage.costUsd + structured.usage.costUsd
            : undefined,
      },
    };
  }

  private async markIdle(sessionId: string): Promise<void> {
    const latest = await this.sessions.getSession(sessionId);
    if (latest?.status !== HarnessSessionStatus.Active) return;
    await this.sessions.updateSession({
      ...latest,
      status: HarnessSessionStatus.Idle,
      updatedAt: new Date(),
    });
  }
}
