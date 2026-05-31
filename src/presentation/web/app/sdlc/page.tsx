import { resolve } from '@/lib/server-container';
import type { ListSdlcBoardUseCase } from '@shepai/core/application/use-cases/sdlc-board/list-sdlc-board.use-case';
import { SdlcBoardClient } from '@/components/features/sdlc-board/sdlc-board-client';

/** Skip static pre-rendering since we need runtime DI container and server context. */
export const dynamic = 'force-dynamic';

export default async function SdlcPage() {
  const useCase = resolve<ListSdlcBoardUseCase>('ListSdlcBoardUseCase');
  const board = await useCase.execute();

  return (
    <div className="flex h-full flex-col p-6">
      <div className="mb-4 shrink-0">
        <h1 className="text-sm font-bold tracking-tight">SDLC Board</h1>
        <p className="text-muted-foreground text-xs">
          Live view of agent tasks across all active features
        </p>
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        <SdlcBoardClient initialEpics={board.epics} />
      </div>
    </div>
  );
}
