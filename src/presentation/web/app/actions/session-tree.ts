'use server';

import { resolve } from '@/lib/server-container';
import type {
  BuildSessionTreeUseCase,
  SessionTreeRepository,
} from '@shepai/core/application/use-cases/agents/build-session-tree.use-case';
import type { ArchiveAgentSessionUseCase } from '@shepai/core/application/use-cases/agents/archive-agent-session.use-case';
import type { DeleteAgentSessionUseCase } from '@shepai/core/application/use-cases/agents/delete-agent-session.use-case';

export interface SessionTreeResponse {
  repositories?: SessionTreeRepository[];
  archivedCount?: number;
  error?: string;
}

export interface SessionMutationResponse {
  ok?: boolean;
  /** True when a transcript file was actually removed */
  deleted?: boolean;
  error?: string;
}

/**
 * Load the Control Center session tree.
 *
 * All joining, bucketing, and the adopted/unadopted determination happen in
 * BuildSessionTreeUseCase — this action only passes the request through.
 */
export async function loadSessionTree(input?: {
  includeArchived?: boolean;
}): Promise<SessionTreeResponse> {
  try {
    const useCase = resolve<BuildSessionTreeUseCase>('BuildSessionTreeUseCase');
    const result = await useCase.execute({ includeArchived: input?.includeArchived ?? false });

    return { repositories: result.repositories, archivedCount: result.archivedCount };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to load session tree';
    return { error: message };
  }
}

/** Archive a session — shep-side only, never touches provider files. */
export async function archiveSession(input: {
  sessionId: string;
  agentType: string;
}): Promise<SessionMutationResponse> {
  try {
    const useCase = resolve<ArchiveAgentSessionUseCase>('ArchiveAgentSessionUseCase');
    await useCase.archive(input);
    return { ok: true };
  } catch (error: unknown) {
    return { error: error instanceof Error ? error.message : 'Failed to archive session' };
  }
}

/** Restore an archived session. */
export async function unarchiveSession(input: {
  sessionId: string;
  agentType: string;
}): Promise<SessionMutationResponse> {
  try {
    const useCase = resolve<ArchiveAgentSessionUseCase>('ArchiveAgentSessionUseCase');
    await useCase.unarchive(input);
    return { ok: true };
  } catch (error: unknown) {
    return { error: error instanceof Error ? error.message : 'Failed to restore session' };
  }
}

/**
 * Permanently delete a session transcript.
 *
 * Destructive and irreversible — the caller must have confirmed with the user
 * before invoking this.
 */
export async function deleteSession(input: {
  sessionId: string;
  agentType: string;
}): Promise<SessionMutationResponse> {
  try {
    const useCase = resolve<DeleteAgentSessionUseCase>('DeleteAgentSessionUseCase');
    const result = await useCase.execute(input);
    return { ok: true, deleted: result.deleted };
  } catch (error: unknown) {
    return { error: error instanceof Error ? error.message : 'Failed to delete session' };
  }
}
