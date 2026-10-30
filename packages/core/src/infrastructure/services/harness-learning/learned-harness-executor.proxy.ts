/**
 * LearnedHarnessExecutorProxy (spec 150)
 *
 * Wraps the executor a feature run hands to its graph. Before every call that
 * names a working directory it installs the run's learned harness there and
 * adds the harness to the call: system-prompt text, the hooks settings file,
 * and the prompt section for agents without a system prompt. Every node —
 * analyze through merge and the CI-fix loop — goes through this one place, so
 * none of them needs to know the learned harness exists.
 *
 * Learning must never break a run: if preparing the harness fails, the call
 * runs exactly as it would have without it.
 */

import type {
  AgentExecutionOptions,
  AgentExecutionResult,
  AgentExecutionStreamEvent,
  IAgentExecutor,
} from '../../../application/ports/output/agents/agent-executor.interface.js';
import type { HarnessInstallation } from '../../../application/ports/output/services/harness-installer.interface.js';
import type { AgentFeature, AgentType } from '../../../domain/generated/output.js';
import { PromptSectionKind } from '../../../domain/harness/prompt-sections.js';
import { LEARNED_SECTION_TITLE } from '../../../domain/harness-learning/harness-install-plan.js';
import type { LearnedHarnessRunSession } from './learned-harness-run-session.js';

const SECTION_SEPARATOR = '\n\n';
const LEARNED_SECTION_ID = 'learned-harness';

export function applyInstallation(
  prompt: string,
  options: AgentExecutionOptions,
  installation: HarnessInstallation
): { prompt: string; options: AgentExecutionOptions } {
  const next: AgentExecutionOptions = { ...options };
  if (installation.systemPrompt) {
    next.systemPrompt = options.systemPrompt
      ? `${options.systemPrompt}${SECTION_SEPARATOR}${installation.systemPrompt}`
      : installation.systemPrompt;
  }
  if (installation.settingsPath) next.settingsPath = installation.settingsPath;
  if (!installation.promptSection) return { prompt, options: next };

  if (options.promptSections) {
    next.promptSections = [
      ...options.promptSections,
      {
        id: LEARNED_SECTION_ID,
        title: LEARNED_SECTION_TITLE,
        kind: PromptSectionKind.Reference,
        content: installation.promptSection,
        pinned: true,
      },
    ];
  }
  return { prompt: `${prompt}${SECTION_SEPARATOR}${installation.promptSection}`, options: next };
}

export class LearnedHarnessExecutorProxy implements IAgentExecutor {
  constructor(
    private readonly inner: IAgentExecutor,
    private readonly session: LearnedHarnessRunSession
  ) {}

  get agentType(): AgentType {
    return this.inner.agentType;
  }

  supportsFeature(feature: AgentFeature): boolean {
    return this.inner.supportsFeature(feature);
  }

  async execute(prompt: string, options?: AgentExecutionOptions): Promise<AgentExecutionResult> {
    const call = await this.prepare(prompt, options);
    return this.inner.execute(call.prompt, call.options);
  }

  async *executeStream(
    prompt: string,
    options?: AgentExecutionOptions
  ): AsyncIterable<AgentExecutionStreamEvent> {
    const call = await this.prepare(prompt, options);
    yield* this.inner.executeStream(call.prompt, call.options);
  }

  private async prepare(
    prompt: string,
    options: AgentExecutionOptions | undefined
  ): Promise<{ prompt: string; options: AgentExecutionOptions | undefined }> {
    if (!options?.cwd) return { prompt, options };
    try {
      const installation = await this.session.prepare(this.inner.agentType, options.cwd);
      return installation ? applyInstallation(prompt, options, installation) : { prompt, options };
    } catch {
      return { prompt, options };
    }
  }
}
