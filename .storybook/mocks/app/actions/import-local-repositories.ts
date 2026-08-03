interface ImportCandidate {
  name: string;
  path: string;
  isGitRepository: boolean;
  alreadyTracked: boolean;
  previouslyRemoved: boolean;
}

interface ImportLocalRepositoryResult {
  path: string;
  imported: boolean;
  repository?: { id: string; name: string; path: string };
  error?: string;
}

/**
 * Storybook scenario switch.
 *
 * Stories set `window.__storybookBulkImportScenario` before rendering so a
 * single mock can serve the Default / Loading / Error / AllTracked stories
 * without each story needing its own module mock.
 */
type Scenario = 'default' | 'loading' | 'error' | 'empty' | 'allTracked' | 'partialFailure';

function scenario(): Scenario {
  return (
    ((globalThis as { __storybookBulkImportScenario?: Scenario })
      .__storybookBulkImportScenario as Scenario) ?? 'default'
  );
}

const CANDIDATES: ImportCandidate[] = [
  {
    name: 'shep',
    path: '/Users/dev/Code/shep',
    isGitRepository: true,
    alreadyTracked: false,
    previouslyRemoved: false,
  },
  {
    name: 'api-server',
    path: '/Users/dev/Code/api-server',
    isGitRepository: true,
    alreadyTracked: false,
    previouslyRemoved: false,
  },
  {
    name: 'design-notes',
    path: '/Users/dev/Code/design-notes',
    isGitRepository: false,
    alreadyTracked: false,
    previouslyRemoved: false,
  },
  {
    name: 'legacy-app',
    path: '/Users/dev/Code/legacy-app',
    isGitRepository: true,
    alreadyTracked: false,
    previouslyRemoved: true,
  },
  {
    name: 'already-here',
    path: '/Users/dev/Code/already-here',
    isGitRepository: true,
    alreadyTracked: true,
    previouslyRemoved: false,
  },
];

export async function discoverImportCandidates(input: { directoryPath: string }): Promise<{
  directoryPath?: string;
  candidates?: ImportCandidate[];
  error?: string;
}> {
  const current = scenario();

  if (current === 'loading') {
    // Never resolves — keeps the loading state on screen for the story.
    return new Promise(() => {
      // Intentionally empty: the story wants a permanently pending promise.
    });
  }

  if (current === 'error') {
    return { error: `Cannot read directory "${input.directoryPath}": permission denied` };
  }

  if (current === 'empty') {
    return { directoryPath: input.directoryPath, candidates: [] };
  }

  if (current === 'allTracked') {
    return {
      directoryPath: input.directoryPath,
      candidates: CANDIDATES.map((c) => ({ ...c, alreadyTracked: true, previouslyRemoved: false })),
    };
  }

  return { directoryPath: input.directoryPath, candidates: CANDIDATES };
}

export async function importLocalRepositories(input: { paths: string[] }): Promise<{
  results?: ImportLocalRepositoryResult[];
  importedCount?: number;
  failedCount?: number;
  error?: string;
}> {
  if (scenario() === 'partialFailure') {
    const results = input.paths.map((path, index) =>
      index === 0
        ? { path, imported: false, error: 'permission denied' }
        : {
            path,
            imported: true,
            repository: { id: `repo-${index}`, name: path.split('/').pop() ?? path, path },
          }
    );
    return {
      results,
      importedCount: results.filter((r) => r.imported).length,
      failedCount: results.filter((r) => !r.imported).length,
    };
  }

  const results = input.paths.map((path, index) => ({
    path,
    imported: true,
    repository: { id: `repo-${index}`, name: path.split('/').pop() ?? path, path },
  }));

  return { results, importedCount: results.length, failedCount: 0 };
}
