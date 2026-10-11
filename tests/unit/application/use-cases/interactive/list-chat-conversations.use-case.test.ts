/**
 * ListChatConversationsUseCase (spec 137): every conversation the chat-first
 * page lists, grouped Shep / repositories / features / applications.
 */

import 'reflect-metadata';
import { describe, it, expect, vi } from 'vitest';
import { ListChatConversationsUseCase } from '@/application/use-cases/interactive/list-chat-conversations.use-case.js';
import type { IRepositoryRepository } from '@/application/ports/output/repositories/repository-repository.interface.js';
import type { IApplicationRepository } from '@/application/ports/output/repositories/application-repository.interface.js';
import type { IWorktreePathProvider } from '@/application/ports/output/services/worktree-path-provider.interface.js';
import {
  ChatScopeKind,
  SdlcLifecycle,
  type Application,
  type Feature,
  type Repository,
} from '@/domain/generated/output.js';
import { createMockFeatureRepository } from '../../../../helpers/feature-repository.mock.js';

const repositories = [{ id: 'r1', name: 'cli', path: '/code/cli' }] as Repository[];
const features = [
  {
    id: 'f1',
    name: 'Dark mode',
    lifecycle: SdlcLifecycle.Implementation,
    repositoryPath: '/code/cli',
    branch: 'feat/dark-mode',
  },
  {
    id: 'f2',
    name: 'Has worktree',
    lifecycle: SdlcLifecycle.Review,
    repositoryPath: '/code/cli',
    branch: 'feat/x',
    worktreePath: '/wt/x',
  },
] as Feature[];
const applications = [
  { id: 'a1', name: 'Todo app', repositoryPath: '/code/todo' },
] as Application[];

function build() {
  const featureRepo = createMockFeatureRepository({ list: vi.fn().mockResolvedValue(features) });
  const useCase = new ListChatConversationsUseCase(
    { list: vi.fn().mockResolvedValue(repositories) } as unknown as IRepositoryRepository,
    featureRepo,
    { list: vi.fn().mockResolvedValue(applications) } as unknown as IApplicationRepository,
    {
      getWorktreePath: (repo: string, branch: string) => `${repo}/wt/${branch}`,
    } as IWorktreePathProvider
  );
  return { useCase, featureRepo };
}

describe('ListChatConversationsUseCase', () => {
  it('lists Shep first, then repositories, features and applications with their scope keys', async () => {
    const { useCase } = build();

    const conversations = await useCase.execute();

    expect(conversations.map((c) => [c.kind, c.scope, c.title])).toEqual([
      [ChatScopeKind.Global, 'global', 'Shep'],
      [ChatScopeKind.Repository, 'repo-r1', 'cli'],
      [ChatScopeKind.Feature, 'f1', 'Dark mode'],
      [ChatScopeKind.Feature, 'f2', 'Has worktree'],
      [ChatScopeKind.Application, 'app-a1', 'Todo app'],
    ]);
  });

  it('gives each conversation the directory its agent works in', async () => {
    const { useCase } = build();

    const byScope = new Map((await useCase.execute()).map((c) => [c.scope, c]));

    expect(byScope.get('global')!.worktreePath).toBeUndefined();
    expect(byScope.get('repo-r1')!.worktreePath).toBe('/code/cli');
    expect(byScope.get('f1')!.worktreePath).toBe('/code/cli/wt/feat/dark-mode');
    expect(byScope.get('f2')!.worktreePath).toBe('/wt/x');
    expect(byScope.get('app-a1')!.worktreePath).toBe('/code/todo');
  });

  it('carries the feature lifecycle and repository for the feature header', async () => {
    const { useCase } = build();
    const f1 = (await useCase.execute()).find((c) => c.scope === 'f1')!;
    expect(f1).toMatchObject({ lifecycle: SdlcLifecycle.Implementation, subtitle: 'cli' });
  });

  it('reads only live features (no archived or deleted ones)', async () => {
    const { useCase, featureRepo } = build();
    await useCase.execute();
    expect(featureRepo.list).toHaveBeenCalledWith();
  });
});
