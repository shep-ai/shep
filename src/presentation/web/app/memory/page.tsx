import { resolve } from '@/lib/server-container';
import type { ManageProjectMemoryUseCase } from '@shepai/core/application/use-cases/project-memory/manage-project-memory.use-case';
import type { ProjectMemory } from '@shepai/core/domain/generated/output';
import { ProjectMemoryPanel } from '@/components/features/project-memory/project-memory-panel';

export const dynamic = 'force-dynamic';

export default async function ProjectMemoryPage() {
  let entries: ProjectMemory[] = [];
  try {
    const useCase = resolve<ManageProjectMemoryUseCase>('ManageProjectMemoryUseCase');
    entries = await useCase.list();
  } catch {
    // DI container not ready / read failure — render the empty state rather
    // than crashing the page.
    entries = [];
  }

  return (
    <div className="flex h-full flex-col overflow-y-auto bg-[#eef0f3] dark:bg-[#111113]">
      <ProjectMemoryPanel entries={entries} />
    </div>
  );
}
