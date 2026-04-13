import { resolve } from '@/lib/server-container';
import type { GetPmProjectUseCase } from '@shepai/core/application/use-cases/pm-projects/get-pm-project.use-case';
import type { GetWorkItemUseCase } from '@shepai/core/application/use-cases/work-items/get-work-item.use-case';
import type { ListWorkItemsUseCase } from '@shepai/core/application/use-cases/work-items/list-work-items.use-case';
import type { ManageWorkItemStatesUseCase } from '@shepai/core/application/use-cases/work-item-states/manage-work-item-states.use-case';
import type { ListWorkItemRelationsUseCase } from '@shepai/core/application/use-cases/work-item-relations/list-work-item-relations.use-case';
import type { ListAttachmentsUseCase } from '@shepai/core/application/use-cases/pm-attachments/list-attachments.use-case';
import type { ListTimeEntriesUseCase } from '@shepai/core/application/use-cases/time-entries/list-time-entries.use-case';
import { WorkItemDetailClient } from './work-item-detail-client';

export const dynamic = 'force-dynamic';

interface WorkItemDetailPageProps {
  params: Promise<{ slug: string; itemId: string }>;
}

export default async function WorkItemDetailPage({ params }: WorkItemDetailPageProps) {
  const { slug, itemId } = await params;

  const projectUseCase = resolve<GetPmProjectUseCase>('GetPmProjectUseCase');
  const projectResult = await projectUseCase.execute(slug);

  if (!projectResult.ok) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <p className="text-muted-foreground text-sm">{projectResult.error}</p>
      </div>
    );
  }

  const project = projectResult.project;

  const getWorkItem = resolve<GetWorkItemUseCase>('GetWorkItemUseCase');
  const workItemResult = await getWorkItem.execute(itemId);

  if (!workItemResult.ok) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <p className="text-muted-foreground text-sm">{workItemResult.error}</p>
      </div>
    );
  }

  const workItem = workItemResult.workItem;

  const [allWorkItems, states, relationsResult, attachmentsResult, timeEntriesResult] =
    await Promise.all([
      resolve<ListWorkItemsUseCase>('ListWorkItemsUseCase').execute(project.id),
      resolve<ManageWorkItemStatesUseCase>('ManageWorkItemStatesUseCase').list(project.id),
      resolve<ListWorkItemRelationsUseCase>('ListWorkItemRelationsUseCase').execute(workItem.id),
      resolve<ListAttachmentsUseCase>('ListAttachmentsUseCase').execute(workItem.id),
      resolve<ListTimeEntriesUseCase>('ListTimeEntriesUseCase').execute(workItem.id),
    ]);

  return (
    <div className="flex h-full flex-col p-6">
      <WorkItemDetailClient
        project={project}
        workItem={workItem}
        allWorkItems={allWorkItems}
        states={states}
        relations={relationsResult}
        attachments={attachmentsResult.attachments}
        timeEntries={timeEntriesResult.timeEntries}
        totalMinutes={timeEntriesResult.totalMinutes}
      />
    </div>
  );
}
