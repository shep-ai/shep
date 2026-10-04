import { resolve } from '@/lib/server-container';
import type {
  GetOpportunityBoardUseCase,
  OpportunityBoard,
} from '@shepai/core/application/use-cases/opportunities/get-opportunity-board.use-case';
import type { GetSpacesOverviewUseCase } from '@shepai/core/application/use-cases/spaces/get-spaces-overview.use-case';
import type { ListPmProjectsUseCase } from '@shepai/core/application/use-cases/pm-projects/list-pm-projects.use-case';
import type { GetFeedbackThemesUseCase } from '@shepai/core/application/use-cases/feedback/feedback-themes.use-case';
import type {
  FeedbackKeyView,
  ManageFeedbackKeysUseCase,
} from '@shepai/core/application/use-cases/feedback/manage-feedback-keys.use-case';
import type { FeedbackTheme } from '@shepai/core/domain/shared/feedback-themes';
import { OpportunitiesPageClient } from '@/components/features/opportunities/opportunities-page-client';
import type { OpportunityPageOptions } from '@/components/features/opportunities/opportunities-types';

export const dynamic = 'force-dynamic';

interface OpportunitiesPageProps {
  searchParams: Promise<{ space?: string }>;
}

async function loadFeedback(
  spaceId: string
): Promise<{ themes: FeedbackTheme[]; feedbackKeys: FeedbackKeyView[] }> {
  const [themes, keys] = await Promise.all([
    resolve<GetFeedbackThemesUseCase>('GetFeedbackThemesUseCase').execute(spaceId),
    resolve<ManageFeedbackKeysUseCase>('ManageFeedbackKeysUseCase').list(spaceId),
  ]);
  return {
    themes: themes.ok ? themes.themes : [],
    feedbackKeys: keys.ok ? keys.keys : [],
  };
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
  let feedback: { themes: FeedbackTheme[]; feedbackKeys: FeedbackKeyView[] } = {
    themes: [],
    feedbackKeys: [],
  };
  let error: string | undefined;
  try {
    const result = await resolve<GetOpportunityBoardUseCase>('GetOpportunityBoardUseCase').execute(
      space
    );
    if (result.ok) {
      board = result.board;
      [options, feedback] = await Promise.all([
        loadOptions(result.board.space.id),
        loadFeedback(result.board.space.id),
      ]);
    } else {
      error = result.error;
    }
  } catch (cause: unknown) {
    error = cause instanceof Error ? cause.message : String(cause);
  }

  return (
    <div className="flex h-full flex-col overflow-y-auto bg-[#eef0f3] dark:bg-[#111113]">
      <OpportunitiesPageClient
        board={board}
        options={options}
        themes={feedback.themes}
        feedbackKeys={feedback.feedbackKeys}
        loadError={error}
      />
    </div>
  );
}
