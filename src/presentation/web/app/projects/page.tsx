import { resolve } from '@/lib/server-container';
import type { ListPmProjectsUseCase } from '@shepai/core/application/use-cases/pm-projects/list-pm-projects.use-case';
import { ProjectsPageClient } from '@/components/features/projects/projects-page-client';

/** Skip static pre-rendering since we need runtime DI container and server context. */
export const dynamic = 'force-dynamic';

export default async function ProjectsPage() {
  const useCase = resolve<ListPmProjectsUseCase>('ListPmProjectsUseCase');
  const projects = await useCase.execute();

  return (
    <div className="flex h-full flex-col p-6">
      <ProjectsPageClient projects={projects} />
    </div>
  );
}
