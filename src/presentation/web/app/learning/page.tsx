import { resolve } from '@/lib/server-container';
import { requireFeaturePage } from '@/lib/require-feature-page';
import { errorMessage } from '@/lib/action-outcome';
import type { ListRepositoriesUseCase } from '@shepai/core/application/use-cases/repositories/list-repositories.use-case';
import type { ListHarnessHistoryUseCase } from '@shepai/core/application/use-cases/harness-learning/list-harness-history.use-case';
import type { GetHarnessVersionUseCase } from '@shepai/core/application/use-cases/harness-learning/get-harness-version.use-case';
import { LearnedHarnessStatus } from '@shepai/core/domain/generated/output';
import { LearningPageClient } from '@/components/features/learning/learning-page-client';
import type {
  HarnessHistory,
  HarnessVersionDetail,
  LearningRepositoryOption,
} from '@/components/features/learning/learning-types';

export const dynamic = 'force-dynamic';

interface LearningPageProps {
  searchParams: Promise<{ repo?: string; version?: string }>;
}

/** With no version in the URL, show what needs a decision first, then what runs now. */
function defaultVersionId(history: HarnessHistory): string | undefined {
  const candidate = history.versions.find(
    (v) => v.version.status === LearnedHarnessStatus.Candidate
  );
  return candidate?.version.id ?? history.currentVersionId ?? history.versions[0]?.version.id;
}

export default async function LearningPage({ searchParams }: LearningPageProps) {
  requireFeaturePage('selfLearning');
  const { repo, version } = await searchParams;
  let repositories: LearningRepositoryOption[] = [];
  let history: HarnessHistory | undefined;
  let detail: HarnessVersionDetail | undefined;
  let loadError: string | undefined;
  try {
    repositories = (
      await resolve<ListRepositoriesUseCase>('ListRepositoriesUseCase').execute()
    ).map((r) => ({ path: r.path, name: r.name }));
    const repositoryPath = repo ?? repositories[0]?.path;
    if (repositoryPath) {
      history = await resolve<ListHarnessHistoryUseCase>('ListHarnessHistoryUseCase').execute({
        repositoryPath,
      });
      const versionId = version ?? defaultVersionId(history);
      detail = versionId
        ? ((await resolve<GetHarnessVersionUseCase>('GetHarnessVersionUseCase').execute({
            versionId,
          })) ?? undefined)
        : undefined;
    }
  } catch (cause: unknown) {
    loadError = errorMessage(cause);
  }

  return (
    <div className="flex h-full flex-col overflow-y-auto bg-[#eef0f3] dark:bg-[#111113]">
      <LearningPageClient
        repositories={repositories}
        {...(history ? { history } : {})}
        {...(detail ? { detail } : {})}
        {...(loadError ? { loadError } : {})}
      />
    </div>
  );
}
