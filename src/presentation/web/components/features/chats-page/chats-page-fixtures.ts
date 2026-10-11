/**
 * Sample conversations (spec 137) for stories.
 */

import { ChatScopeKind, SdlcLifecycle } from '@shepai/core/domain/generated/output';
import type { ChatConversation } from '@shepai/core/application/use-cases/interactive/list-chat-conversations.use-case';

export const sampleConversations: ChatConversation[] = [
  { scope: 'global', kind: ChatScopeKind.Global, title: 'Shep' },
  { scope: 'repo-r1', kind: ChatScopeKind.Repository, title: 'cli', worktreePath: '/code/cli' },
  { scope: 'repo-r2', kind: ChatScopeKind.Repository, title: 'web', worktreePath: '/code/web' },
  {
    scope: 'f1',
    kind: ChatScopeKind.Feature,
    title: 'Dark mode',
    subtitle: 'web',
    worktreePath: '/wt/dark-mode',
    featureId: 'f1',
    lifecycle: SdlcLifecycle.Implementation,
  },
  {
    scope: 'f2',
    kind: ChatScopeKind.Feature,
    title: 'Magic-link login',
    subtitle: 'cli',
    worktreePath: '/wt/login',
    featureId: 'f2',
    lifecycle: SdlcLifecycle.Requirements,
  },
  {
    scope: 'app-a1',
    kind: ChatScopeKind.Application,
    title: 'Todo app',
    worktreePath: '/code/todo',
  },
];
