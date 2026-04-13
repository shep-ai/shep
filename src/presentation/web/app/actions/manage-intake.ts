'use server';

import { resolve } from '@/lib/server-container';
import type { CreateIntakeItemUseCase } from '@shepai/core/application/use-cases/intake/create-intake-item.use-case';
import type { ListIntakeItemsUseCase } from '@shepai/core/application/use-cases/intake/list-intake-items.use-case';
import type { AcceptIntakeItemUseCase } from '@shepai/core/application/use-cases/intake/accept-intake-item.use-case';
import type { DeclineIntakeItemUseCase } from '@shepai/core/application/use-cases/intake/decline-intake-item.use-case';
import type { AutoTriageIntakeItemUseCase } from '@shepai/core/application/use-cases/intake/auto-triage-intake-item.use-case';
import type { DetectDuplicatesUseCase } from '@shepai/core/application/use-cases/intake/detect-duplicates.use-case';
import type { IntakeItem, WorkItem } from '@shepai/core/domain/generated/output';

export async function createIntakeItem(input: {
  projectId: string;
  title: string;
  source: string;
  description?: string;
}): Promise<{ intakeItem?: IntakeItem; error?: string }> {
  try {
    const useCase = resolve<CreateIntakeItemUseCase>('CreateIntakeItemUseCase');
    const result = await useCase.execute(input);
    if (!result.ok) return { error: result.error };
    return { intakeItem: result.intakeItem };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to create intake item';
    return { error: message };
  }
}

export async function listIntakeItems(
  projectId: string,
  status?: string
): Promise<{ items?: IntakeItem[]; error?: string }> {
  try {
    const useCase = resolve<ListIntakeItemsUseCase>('ListIntakeItemsUseCase');
    const result = await useCase.execute({ projectId, status });
    return { items: result.items };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to list intake items';
    return { error: message };
  }
}

export async function acceptIntakeItem(
  intakeItemId: string
): Promise<{ workItem?: WorkItem; error?: string }> {
  try {
    const useCase = resolve<AcceptIntakeItemUseCase>('AcceptIntakeItemUseCase');
    const result = await useCase.execute({ intakeItemId });
    if (!result.ok) return { error: result.error };
    return { workItem: result.workItem };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to accept intake item';
    return { error: message };
  }
}

export async function declineIntakeItem(
  intakeItemId: string,
  reason: string
): Promise<{ error?: string }> {
  try {
    const useCase = resolve<DeclineIntakeItemUseCase>('DeclineIntakeItemUseCase');
    const result = await useCase.execute({ intakeItemId, reason });
    if (!result.ok) return { error: result.error };
    return {};
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to decline intake item';
    return { error: message };
  }
}

export async function autoTriageIntakeItem(
  intakeItemId: string
): Promise<{ suggestions?: Record<string, unknown>; error?: string }> {
  try {
    const useCase = resolve<AutoTriageIntakeItemUseCase>('AutoTriageIntakeItemUseCase');
    const result = await useCase.execute({ intakeItemId });
    if (!result.ok) return { error: result.error };
    return { suggestions: result.suggestions as Record<string, unknown> };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to auto-triage intake item';
    return { error: message };
  }
}

export async function detectDuplicates(
  intakeItemId: string
): Promise<{ candidates?: { workItem: WorkItem; score: number }[]; error?: string }> {
  try {
    const useCase = resolve<DetectDuplicatesUseCase>('DetectDuplicatesUseCase');
    const result = await useCase.execute({ intakeItemId });
    if (!result.ok) return { error: result.error };
    return { candidates: result.candidates };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to detect duplicates';
    return { error: message };
  }
}
