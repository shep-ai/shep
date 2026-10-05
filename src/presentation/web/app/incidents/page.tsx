import { resolve } from '@/lib/server-container';
import { errorMessage } from '@/lib/action-outcome';
import type {
  GetIncidentBoardUseCase,
  IncidentBoard,
} from '@shepai/core/application/use-cases/incidents/get-incident-board.use-case';
import type { GetSpacesOverviewUseCase } from '@shepai/core/application/use-cases/spaces/get-spaces-overview.use-case';
import { IncidentsPageClient } from '@/components/features/incidents/incidents-page-client';
import type { IncidentSpaceOption } from '@/components/features/incidents/incidents-types';

export const dynamic = 'force-dynamic';

interface IncidentsPageProps {
  searchParams: Promise<{ space?: string; incident?: string }>;
}

async function loadSpaces(): Promise<IncidentSpaceOption[]> {
  const overview = await resolve<GetSpacesOverviewUseCase>('GetSpacesOverviewUseCase').execute();
  return overview.spaces.map(({ space }) => ({ id: space.id, name: space.name, slug: space.slug }));
}

export default async function IncidentsPage({ searchParams }: IncidentsPageProps) {
  const { space, incident } = await searchParams;
  let spaces: IncidentSpaceOption[] = [];
  let board: IncidentBoard | undefined;
  let error: string | undefined;
  try {
    const [loaded, result] = await Promise.all([
      loadSpaces(),
      resolve<GetIncidentBoardUseCase>('GetIncidentBoardUseCase').execute({
        ...(space ? { space } : {}),
        ...(incident ? { incident } : {}),
      }),
    ]);
    spaces = loaded;
    if (result.ok) board = result.board;
    else error = result.error;
  } catch (cause: unknown) {
    error = errorMessage(cause);
  }

  return (
    <div className="flex h-full flex-col overflow-y-auto bg-[#eef0f3] dark:bg-[#111113]">
      <IncidentsPageClient
        spaces={spaces}
        {...(board
          ? {
              space: { id: board.space.id, name: board.space.name, slug: board.space.slug },
              incidents: board.incidents,
              ...(board.selected ? { selected: board.selected } : {}),
            }
          : {})}
        {...(error ? { loadError: error } : {})}
      />
    </div>
  );
}
