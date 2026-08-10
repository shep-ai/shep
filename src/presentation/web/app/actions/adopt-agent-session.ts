'use server';

import { resolve } from '@/lib/server-container';
import type { AdoptAgentSessionUseCase } from '@shepai/core/application/use-cases/agents/adopt-agent-session.use-case';
import type { ResumeAgentSessionUseCase } from '@shepai/core/application/use-cases/agents/resume-agent-session.use-case';

export interface AdoptAgentSessionResponse {
  featureId?: string;
  featureName?: string;
  /** True when the summary came from deterministic extraction, not the model */
  derivedLocally?: boolean;
  error?: string;
}

export interface ResumeAgentSessionResponse {
  terminalId?: string;
  /** The resume invocation, safe to display or copy */
  command?: string;
  error?: string;
}

/**
 * Adopt an existing agent CLI session as a shep feature.
 *
 * All derivation happens in the use case — this action passes identifiers only
 * and never builds a prompt.
 */
export async function adoptAgentSession(input: {
  sessionId: string;
  agentType: string;
  repositoryPath: string;
}): Promise<AdoptAgentSessionResponse> {
  if (!input.sessionId?.trim() || !input.repositoryPath?.trim()) {
    return { error: 'sessionId and repositoryPath are required' };
  }

  try {
    const useCase = resolve<AdoptAgentSessionUseCase>('AdoptAgentSessionUseCase');
    const result = await useCase.execute({
      sessionId: input.sessionId,
      agentType: input.agentType,
      repositoryPath: input.repositoryPath,
    });

    return {
      featureId: result.feature.id,
      featureName: result.feature.name,
      derivedLocally: result.derivedLocally,
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to adopt session';
    return { error: message };
  }
}

/** Resume a session in shep's embedded terminal. */
export async function resumeAgentSession(input: {
  sessionId: string;
  agentType: string;
  cwd: string;
}): Promise<ResumeAgentSessionResponse> {
  if (!input.sessionId?.trim() || !input.cwd?.trim()) {
    return { error: 'sessionId and cwd are required' };
  }

  try {
    const useCase = resolve<ResumeAgentSessionUseCase>('ResumeAgentSessionUseCase');
    const result = await useCase.execute({
      sessionId: input.sessionId,
      agentType: input.agentType,
      cwd: input.cwd,
    });

    return { terminalId: result.terminal.id, command: result.descriptor.displayCommand };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to resume session';
    return { error: message };
  }
}

/**
 * Build the resume command without starting anything.
 *
 * Backs the copy-to-clipboard action, so the UI never composes the command
 * itself — that is how the broken `--project` flag shipped.
 */
export async function describeResumeCommand(input: {
  sessionId: string;
  agentType: string;
  cwd: string;
}): Promise<ResumeAgentSessionResponse> {
  try {
    const useCase = resolve<ResumeAgentSessionUseCase>('ResumeAgentSessionUseCase');
    const descriptor = useCase.describe({
      sessionId: input.sessionId,
      agentType: input.agentType,
      cwd: input.cwd,
    });

    // Clipboard form cds into the project first — a bare `--resume <id>` finds
    // no session when pasted outside the project directory.
    return { command: descriptor.clipboardCommand };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Cannot resume this session';
    return { error: message };
  }
}
