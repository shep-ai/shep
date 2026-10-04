import { resolve } from '@/lib/server-container';
import type { ManageProjectMemoryUseCase } from '@shepai/core/application/use-cases/project-memory/manage-project-memory.use-case';
import type { GetSpacesOverviewUseCase } from '@shepai/core/application/use-cases/spaces/get-spaces-overview.use-case';
import type { ProjectMemory } from '@shepai/core/domain/generated/output';
import { ProjectMemoryPanel } from '@/components/features/project-memory/project-memory-panel';
import type { MemorySpaceOption } from '@/components/features/project-memory/memory-space-option';

export const dynamic = 'force-dynamic';

async function loadSpaces(): Promise<MemorySpaceOption[]> {
  const overview = await resolve<GetSpacesOverviewUseCase>('GetSpacesOverviewUseCase').execute();
  return overview.spaces.map(({ space, productLines }) => ({
    id: space.id,
    name: space.name,
    ...(space.color ? { color: space.color } : {}),
    productLines: productLines.map((line) => ({ id: line.id, name: line.name })),
  }));
}

export default async function ProjectMemoryPage() {
  let entries: ProjectMemory[] = [];
  let spaces: MemorySpaceOption[] = [];
  try {
    const useCase = resolve<ManageProjectMemoryUseCase>('ManageProjectMemoryUseCase');
    [entries, spaces] = await Promise.all([useCase.list(), loadSpaces()]);
  } catch {
    // DI container not ready / read failure — render the empty state rather
    // than crashing the page.
    entries = [];
    spaces = [];
  }

  return (
    <div className="flex h-full flex-col overflow-y-auto bg-[#eef0f3] dark:bg-[#111113]">
      <ProjectMemoryPanel entries={entries} spaces={spaces} />
    </div>
  );
}
