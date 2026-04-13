import { resolve } from '@/lib/server-container';
import type { GetPmProjectUseCase } from '@shepai/core/application/use-cases/pm-projects/get-pm-project.use-case';
import type { ManageWorkItemStatesUseCase } from '@shepai/core/application/use-cases/work-item-states/manage-work-item-states.use-case';
import type { ManageLabelsUseCase } from '@shepai/core/application/use-cases/labels/manage-labels.use-case';
import type { ListProjectMembersUseCase } from '@shepai/core/application/use-cases/project-members/list-project-members.use-case';
import { ProjectSettingsClient } from './project-settings-client';

export const dynamic = 'force-dynamic';

interface ProjectSettingsPageProps {
  params: Promise<{ slug: string }>;
}

export default async function ProjectSettingsPage({ params }: ProjectSettingsPageProps) {
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
  const [states, labels, membersResult] = await Promise.all([
    resolve<ManageWorkItemStatesUseCase>('ManageWorkItemStatesUseCase').list(project.id),
    resolve<ManageLabelsUseCase>('ManageLabelsUseCase').list(project.id),
    resolve<ListProjectMembersUseCase>('ListProjectMembersUseCase').execute(project.id),
  ]);

  const members = membersResult.ok ? membersResult.members : [];

  return (
    <div className="flex h-full flex-col p-6">
      <ProjectSettingsClient project={project} states={states} labels={labels} members={members} />
    </div>
  );
}
