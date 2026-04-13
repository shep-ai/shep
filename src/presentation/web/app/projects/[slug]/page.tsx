import { resolve } from '@/lib/server-container';
import type { GetPmProjectUseCase } from '@shepai/core/application/use-cases/pm-projects/get-pm-project.use-case';
import type { ListWorkItemsUseCase } from '@shepai/core/application/use-cases/work-items/list-work-items.use-case';
import type { ManageWorkItemStatesUseCase } from '@shepai/core/application/use-cases/work-item-states/manage-work-item-states.use-case';
import type { ManageLabelsUseCase } from '@shepai/core/application/use-cases/labels/manage-labels.use-case';
import type { ListCyclesUseCase } from '@shepai/core/application/use-cases/cycles/list-cycles.use-case';
import type { ListModulesUseCase } from '@shepai/core/application/use-cases/modules/list-modules.use-case';
import type { ListEpicsUseCase } from '@shepai/core/application/use-cases/epics/list-epics.use-case';
import { ProjectDetailClient } from '@/components/features/projects/project-detail-client';

/** Skip static pre-rendering since we need runtime DI container and server context. */
export const dynamic = 'force-dynamic';

interface ProjectDetailPageProps {
  params: Promise<{ slug: string }>;
}

export default async function ProjectDetailPage({ params }: ProjectDetailPageProps) {
  const { slug } = await params;
  const projectUseCase = resolve<GetPmProjectUseCase>('GetPmProjectUseCase');
  const result = await projectUseCase.execute(slug);

  if (!result.ok) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <p className="text-muted-foreground text-sm">{result.error}</p>
      </div>
    );
  }

  const project = result.project;
  const [workItems, states, labels, cycles, modules, epicsResult] = await Promise.all([
    resolve<ListWorkItemsUseCase>('ListWorkItemsUseCase').execute(project.id),
    resolve<ManageWorkItemStatesUseCase>('ManageWorkItemStatesUseCase').list(project.id),
    resolve<ManageLabelsUseCase>('ManageLabelsUseCase').list(project.id),
    resolve<ListCyclesUseCase>('ListCyclesUseCase').execute(project.id),
    resolve<ListModulesUseCase>('ListModulesUseCase').execute(project.id),
    resolve<ListEpicsUseCase>('ListEpicsUseCase').execute(project.id),
  ]);

  return (
    <div className="flex h-full flex-col p-6">
      <ProjectDetailClient
        project={project}
        workItems={workItems}
        states={states}
        labels={labels}
        cycles={cycles}
        modules={modules}
        epics={epicsResult.epics}
      />
    </div>
  );
}
