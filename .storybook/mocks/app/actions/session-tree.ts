interface TreeSession {
  id: string;
  agentType: string;
  preview?: string;
  messageCount: number;
  lastMessageAt?: string;
  filePath?: string;
  adopted: boolean;
  archived: boolean;
}

type Scenario = 'default' | 'loading' | 'error' | 'empty' | 'archived';

function scenario(): Scenario {
  return (
    ((globalThis as { __storybookSessionTreeScenario?: Scenario })
      .__storybookSessionTreeScenario as Scenario) ?? 'default'
  );
}

function session(id: string, adopted: boolean, archived = false): TreeSession {
  return {
    id,
    agentType: id.startsWith('cur') ? 'cursor' : 'claude-code',
    preview: `Work on ${id}`,
    messageCount: 12,
    lastMessageAt: '2026-08-03T16:00:00Z',
    filePath: `/Users/dev/.claude/projects/-Users-dev-Code-shep/${id}.jsonl`,
    adopted,
    archived,
  };
}

export async function loadSessionTree(input?: { includeArchived?: boolean }): Promise<{
  repositories?: unknown[];
  archivedCount?: number;
  error?: string;
}> {
  const current = scenario();

  if (current === 'loading') {
    return new Promise(() => {
      // Intentionally pending — keeps the loading state visible in the story.
    });
  }

  if (current === 'error') {
    return { error: 'Failed to read session transcripts' };
  }

  if (current === 'empty') {
    return { repositories: [], archivedCount: 0 };
  }

  return {
    repositories: [
      {
        id: 'repo-1',
        name: 'shep',
        path: '/Users/dev/Code/shep',
        features: [
          {
            id: 'feat-1',
            name: 'Reliable Feature Log Viewing',
            lifecycle: 'Implementation',
            sessions: [session('adopted-1', true)],
          },
          {
            id: 'feat-2',
            name: 'Bulk repository import',
            lifecycle: 'Requirements',
            sessions: [],
          },
        ],
        unadoptedSessions: [
          session('loose-1', false),
          session('cur-loose-2', false),
          ...(input?.includeArchived ? [session('archived-one', false, true)] : []),
        ],
        sessionCount: input?.includeArchived ? 4 : 3,
      },
      {
        id: 'repo-2',
        name: 'agentbase',
        path: '/Users/dev/Code/agentbase',
        features: [],
        unadoptedSessions: [session('loose-3', false)],
        sessionCount: 1,
      },
      {
        id: 'repo-3',
        name: 'infra',
        path: '/Users/dev/Code/infra',
        features: [],
        unadoptedSessions: [],
        sessionCount: 0,
      },
    ],
    archivedCount: 1,
  };
}

export async function archiveSession(): Promise<{ ok?: boolean; error?: string }> {
  return { ok: true };
}

export async function unarchiveSession(): Promise<{ ok?: boolean; error?: string }> {
  return { ok: true };
}

export async function deleteSession(): Promise<{
  ok?: boolean;
  deleted?: boolean;
  error?: string;
}> {
  return { ok: true, deleted: true };
}
