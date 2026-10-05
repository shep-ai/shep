import { resolve } from '@/lib/server-container';
import { errorMessage } from '@/lib/action-outcome';
import type {
  FactoryStatus,
  GetFactoryStatusUseCase,
} from '@shepai/core/application/use-cases/autopilot/get-factory-status.use-case';
import type { ManageAutopilotUseCase } from '@shepai/core/application/use-cases/autopilot/manage-autopilot.use-case';
import type { GetSpacesOverviewUseCase } from '@shepai/core/application/use-cases/spaces/get-spaces-overview.use-case';
import type { ListPmProjectsUseCase } from '@shepai/core/application/use-cases/pm-projects/list-pm-projects.use-case';
import type { AutopilotRun } from '@shepai/core/domain/generated/output';
import { FactoryPageClient } from '@/components/features/factory/factory-page-client';
import type {
  FactoryProject,
  FactorySpaceOption,
} from '@/components/features/factory/factory-types';

export const dynamic = 'force-dynamic';

interface FactoryPageProps {
  searchParams: Promise<{ space?: string }>;
}

export default async function FactoryPage({ searchParams }: FactoryPageProps) {
  const { space } = await searchParams;
  let spaces: FactorySpaceOption[] = [];
  let projects: FactoryProject[] = [];
  let status: FactoryStatus | undefined;
  let runs: AutopilotRun[] = [];
  let error: string | undefined;
  try {
    const [overview, allProjects, result] = await Promise.all([
      resolve<GetSpacesOverviewUseCase>('GetSpacesOverviewUseCase').execute(),
      resolve<ListPmProjectsUseCase>('ListPmProjectsUseCase').execute(),
      resolve<GetFactoryStatusUseCase>('GetFactoryStatusUseCase').execute(space),
    ]);
    spaces = overview.spaces.map(({ space: s }) => ({ id: s.id, name: s.name, slug: s.slug }));
    projects = allProjects.map((project) => ({ id: project.id, name: project.name }));
    if (result.ok) {
      status = result.status;
      const autopilot = await resolve<ManageAutopilotUseCase>('ManageAutopilotUseCase').get(
        result.status.space.id
      );
      if (autopilot.ok) runs = autopilot.runs;
    } else {
      error = result.error;
    }
  } catch (cause: unknown) {
    error = errorMessage(cause);
  }

  return (
    <div className="flex h-full flex-col overflow-y-auto bg-[#eef0f3] dark:bg-[#111113]">
      <FactoryPageClient
        spaces={spaces}
        projects={projects}
        runs={runs}
        {...(status ? { status } : {})}
        {...(error ? { loadError: error } : {})}
      />
    </div>
  );
}
