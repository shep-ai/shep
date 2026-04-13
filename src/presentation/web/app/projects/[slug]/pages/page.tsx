import { resolve } from '@/lib/server-container';
import type { GetPmProjectUseCase } from '@shepai/core/application/use-cases/pm-projects/get-pm-project.use-case';
import type { ListPagesUseCase } from '@shepai/core/application/use-cases/pages/list-pages.use-case';
import { PagesPanel } from '@/components/pm/page-editor/pages-panel';

/** Skip static pre-rendering since we need runtime DI container and server context. */
export const dynamic = 'force-dynamic';

interface ProjectPagesPageProps {
  params: Promise<{ slug: string }>;
}

export default async function ProjectPagesPage({ params }: ProjectPagesPageProps) {
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
  const pagesUseCase = resolve<ListPagesUseCase>('ListPagesUseCase');
  const pagesResult = await pagesUseCase.execute(project.id);

  return (
    <div className="flex h-full flex-col">
      <PagesPanel
        projectId={project.id}
        pages={pagesResult.ok ? pagesResult.pages : []}
        className="h-full"
      />
    </div>
  );
}
