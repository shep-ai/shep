'use server';

import { resolve } from '@/lib/server-container';
import { FEATURE_OFF_ERROR, isFeatureOn } from '@/lib/feature-gate';
import type { ListSdlcBoardUseCase } from '@shepai/core/application/use-cases/sdlc-board/list-sdlc-board.use-case';
import type { SdlcBoardData } from '@shepai/core/application/use-cases/sdlc-board/list-sdlc-board.use-case';

export async function listSdlcBoard(): Promise<{ boardData?: SdlcBoardData; error?: string }> {
  if (!isFeatureOn('sdlcBoard')) return { error: FEATURE_OFF_ERROR };
  try {
    const useCase = resolve<ListSdlcBoardUseCase>('ListSdlcBoardUseCase');
    const boardData = await useCase.execute();
    return { boardData };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to load SDLC board';
    return { error: message };
  }
}
