/** Shared fakes for the PR comment use-case tests (spec 124). */

import { vi } from 'vitest';
import {
  AgentType,
  PrCommentKind,
  PrCommentStatus,
  type PrCommentTrigger,
  PrStatus,
  SdlcLifecycle,
  type Feature,
  type PrComment,
} from '@/domain/generated/output.js';
import type { IFeatureRepository } from '@/application/ports/output/repositories/feature-repository.interface.js';
import type { IWorktreePathProvider } from '@/application/ports/output/services/worktree-path-provider.interface.js';
import type {
  IPullRequestCommentService,
  PullRequestTarget,
  RemotePrComment,
} from '@/application/ports/output/services/pull-request-comment-service.interface.js';
import type { ResolveSpaceEnvironmentUseCase } from '@/application/use-cases/spaces/resolve-space-environment.use-case.js';
import type { SpaceEnvironment } from '@/domain/shared/space-environment.js';

export const T0 = new Date('2026-10-05T10:00:00Z');

export const FEATURE = {
  id: 'feat-1234-abcd',
  name: 'Refund guests',
  repositoryPath: '/src/pay',
  branch: 'feat/refund-guests',
  worktreePath: '/wt/refund-guests',
  lifecycle: SdlcLifecycle.Review,
  agentRunId: 'run-1',
  pr: { url: 'https://github.com/o/r/pull/7', number: 7, status: PrStatus.Open },
  createdAt: T0,
  updatedAt: T0,
} as unknown as Feature;

export const SPACE_ENVIRONMENT: SpaceEnvironment = {
  set: { GH_CONFIG_DIR: '/gh-work' },
  unset: ['GH_TOKEN'],
};

export function fakeFeatures(features: Feature[] = [FEATURE]): IFeatureRepository {
  return {
    findById: vi.fn(async (id: string) => features.find((f) => f.id === id) ?? null),
    findByIdPrefix: vi.fn(
      async (prefix: string) => features.find((f) => f.id.startsWith(prefix)) ?? null
    ),
    list: vi.fn(async (filters?: { lifecycle?: SdlcLifecycle }) =>
      features.filter((f) => !filters?.lifecycle || f.lifecycle === filters.lifecycle)
    ),
  } as unknown as IFeatureRepository;
}

export const WORKTREE_PATHS: IWorktreePathProvider = {
  getWorktreePath: (repo: string, branch: string) => `${repo}/.wt/${branch}`,
};

export function fakeSpaceEnvironment(
  options: { refusal?: string; trigger?: PrCommentTrigger; resolveThreads?: boolean } = {}
): ResolveSpaceEnvironmentUseCase {
  return {
    execute: vi.fn(async () => ({
      context: {
        space: {
          id: 'space-work',
          name: 'Work',
          agentSettings: {
            ...(options.trigger ? { prCommentTrigger: options.trigger } : {}),
            ...(options.resolveThreads !== undefined
              ? { prCommentResolveThreads: options.resolveThreads }
              : {}),
          },
        },
      },
      environment: SPACE_ENVIRONMENT,
      ...(options.refusal ? { agentRefusal: options.refusal } : {}),
    })),
  } as unknown as ResolveSpaceEnvironmentUseCase;
}

export function remote(over: Partial<RemotePrComment> = {}): RemotePrComment {
  return {
    githubId: '301',
    kind: PrCommentKind.Inline,
    author: 'ada',
    authorIsBot: false,
    body: '#shep rename total to totalCents',
    path: 'src/refund.ts',
    line: 42,
    diffHunk: '@@ -40,3 +40,3 @@',
    threadId: 'PRRT_1',
    threadResolved: false,
    url: 'https://github.com/o/r/pull/7#discussion_r301',
    writtenAt: T0,
    ...over,
  };
}

export function fakeClient(comments: RemotePrComment[] = [remote()]) {
  return {
    list: vi.fn(async (_target: PullRequestTarget) => comments),
    reply: vi.fn(async (_target: unknown, to: { githubId: string }) => `reply-to-${to.githubId}`),
    resolveThread: vi.fn(async () => undefined),
  } satisfies IPullRequestCommentService;
}

export function stored(over: Partial<PrComment> = {}): PrComment {
  return {
    id: 'c1',
    featureId: FEATURE.id,
    githubId: '301',
    kind: PrCommentKind.Inline,
    author: 'ada',
    body: '#shep rename total to totalCents',
    path: 'src/refund.ts',
    line: 42,
    threadId: 'PRRT_1',
    url: 'https://github.com/o/r/pull/7#discussion_r301',
    writtenAt: T0,
    status: PrCommentStatus.Pending,
    createdAt: T0,
    updatedAt: T0,
    ...over,
  };
}

export const DEFAULT_AGENT = AgentType.ClaudeCode;
