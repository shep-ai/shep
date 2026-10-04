'use server';

/**
 * Server actions for feedback keys and themes on the Opportunities page
 * (spec 127). Creating a key is the one action that returns a secret: the
 * page shows it once and never again.
 */

import { resolve } from '@/lib/server-container';
import { attemptOutcome, errorMessage } from '@/lib/action-outcome';
import type { ManageFeedbackKeysUseCase } from '@shepai/core/application/use-cases/feedback/manage-feedback-keys.use-case';
import type {
  PromoteThemeInput,
  PromoteThemeUseCase,
} from '@shepai/core/application/use-cases/feedback/feedback-themes.use-case';

const keys = () => resolve<ManageFeedbackKeysUseCase>('ManageFeedbackKeysUseCase');

export async function createFeedbackKey(
  space: string,
  name: string
): Promise<{ ok: true; secret: string } | { ok: false; error: string }> {
  try {
    const result = await keys().create({ space, name });
    return result.ok ? { ok: true, secret: result.secret } : result;
  } catch (error: unknown) {
    return { ok: false, error: errorMessage(error) };
  }
}

export async function revokeFeedbackKey(id: string) {
  return attemptOutcome(() => keys().revoke(id));
}

export async function promoteTheme(input: PromoteThemeInput) {
  return attemptOutcome(() => resolve<PromoteThemeUseCase>('PromoteThemeUseCase').execute(input));
}
