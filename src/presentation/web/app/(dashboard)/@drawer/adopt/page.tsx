import { resolve } from '@/lib/server-container';
import type { ListRepositoriesUseCase } from '@shepai/core/application/use-cases/repositories/list-repositories.use-case';
import { AdoptDrawerClient } from '@/components/common/control-center-drawer/adopt-drawer-client';

/** Skip static pre-rendering since we need runtime DI container. */
export const dynamic = 'force-dynamic';

interface AdoptDrawerPageProps {
  searchParams: Promise<{ repo?: string }>;
}

export default async function AdoptDrawerPage({ searchParams }: AdoptDrawerPageProps) {
  const { repo } = await searchParams;

  let repositoryPath = repo ?? '';
  let repositoryOptions: { id: string; name: string; path: string }[] = [];

  try {
    const listRepos = resolve<ListRepositoriesUseCase>('ListRepositoriesUseCase');
    const repositories = await listRepos.execute();
    repositoryOptions = repositories.map((r) => ({
      id: r.id,
      name: r.name,
      path: r.path,
    }));

    if (!repositoryPath && repositories.length > 0) {
      repositoryPath = repositories[0].path;
    }
  } catch {
    // Fall through with empty path — server action will validate
  }

  return <AdoptDrawerClient repositoryPath={repositoryPath} repositories={repositoryOptions} />;
}
