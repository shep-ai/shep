'use server';

import { resolve } from '@/lib/server-container';
import type { ListSdlcBoardUseCase } from '@shepai/core/application/use-cases/sdlc-board/list-sdlc-board.use-case';
import type { SdlcBoardData } from '@shepai/core/application/use-cases/sdlc-board/list-sdlc-board.use-case';

export async function listSdlcBoard(): Promise<{ boardData?: SdlcBoardData; error?: string }> {
  try {
    const useCase = resolve<ListSdlcBoardUseCase>('ListSdlcBoardUseCase');
    const boardData = await useCase.execute();
    return { boardData };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to load SDLC board';
    return { error: message };
  }
}
