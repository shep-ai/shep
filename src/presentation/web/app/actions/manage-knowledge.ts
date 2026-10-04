'use server';

/**
 * Server actions for knowledge sources on the Connections page (spec 125).
 * Each calls one use case and returns only success or the error; a thrown
 * error becomes a failed result.
 */

import { resolve } from '@/lib/server-container';
import { attemptOutcome, runsOutcome, type ActionOutcome } from '@/lib/action-outcome';
import type {
  CreateKnowledgeSourceInput,
  ManageKnowledgeSourcesUseCase,
} from '@shepai/core/application/use-cases/knowledge/manage-knowledge-sources.use-case';
import type { SyncKnowledgeSourceUseCase } from '@shepai/core/application/use-cases/knowledge/sync-knowledge-source.use-case';
import type { SyncKnowledgeSourcesUseCase } from '@shepai/core/application/use-cases/knowledge/sync-knowledge-sources.use-case';

const sources = () => resolve<ManageKnowledgeSourcesUseCase>('ManageKnowledgeSourcesUseCase');

export async function createKnowledgeSource(input: CreateKnowledgeSourceInput) {
  return attemptOutcome(() => sources().create(input));
}

export async function setKnowledgeSourceEnabled(id: string, enabled: boolean) {
  return attemptOutcome(() => sources().setEnabled(id, enabled));
}

export async function removeKnowledgeSource(id: string) {
  return attemptOutcome(() => sources().remove(id));
}

/** Syncs one source, or every enabled one; fails with the first run's error, if any. */
export async function syncKnowledge(sourceId?: string): Promise<ActionOutcome> {
  return runsOutcome(async () =>
    sourceId
      ? [await resolve<SyncKnowledgeSourceUseCase>('SyncKnowledgeSourceUseCase').execute(sourceId)]
      : await resolve<SyncKnowledgeSourcesUseCase>('SyncKnowledgeSourcesUseCase').runAll()
  );
}
