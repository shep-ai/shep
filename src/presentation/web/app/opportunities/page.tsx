import { resolve } from '@/lib/server-container';
import type {
  GetOpportunityBoardUseCase,
  OpportunityBoard,
} from '@shepai/core/application/use-cases/opportunities/get-opportunity-board.use-case';
import type { GetSpacesOverviewUseCase } from '@shepai/core/application/use-cases/spaces/get-spaces-overview.use-case';
import type { ListPmProjectsUseCase } from '@shepai/core/application/use-cases/pm-projects/list-pm-projects.use-case';
import { OpportunitiesPageClient } from '@/components/features/opportunities/opportunities-page-client';
import type { OpportunityPageOptions } from '@/components/features/opportunities/opportunities-types';

export const dynamic = 'force-dynamic';

interface OpportunitiesPageProps {
  searchParams: Promise<{ space?: string }>;
}

async function loadOptions(spaceId: string): Promise<OpportunityPageOptions> {
  const [overview, projects] = await Promise.all([
    resolve<GetSpacesOverviewUseCase>('GetSpacesOverviewUseCase').execute(),
    resolve<ListPmProjectsUseCase>('ListPmProjectsUseCase').execute(),
  ]);
  const current = overview.spaces.find(({ space }) => space.id === spaceId);
  return {
    spaces: overview.spaces.map(({ space }) => ({
      id: space.id,
      name: space.name,
      slug: space.slug,
    })),
    productLines: (current?.productLines ?? []).map((line) => ({ id: line.id, name: line.name })),
    projects: projects.map((project) => ({ id: project.id, name: project.name })),
  };
}

export default async function OpportunitiesPage({ searchParams }: OpportunitiesPageProps) {
  const { space } = await searchParams;
  let board: OpportunityBoard | undefined;
  let options: OpportunityPageOptions = { spaces: [], productLines: [], projects: [] };
  let error: string | undefined;
  try {
    const result = await resolve<GetOpportunityBoardUseCase>('GetOpportunityBoardUseCase').execute(
      space
    );
    if (result.ok) {
      board = result.board;
      options = await loadOptions(result.board.space.id);
    } else {
      error = result.error;
    }
  } catch (cause: unknown) {
    error = cause instanceof Error ? cause.message : String(cause);
  }

  return (
    <div className="flex h-full flex-col overflow-y-auto bg-[#eef0f3] dark:bg-[#111113]">
      <OpportunitiesPageClient board={board} options={options} loadError={error} />
    </div>
  );
}
