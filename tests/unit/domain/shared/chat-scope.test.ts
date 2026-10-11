/**
 * Chat scopes (spec 137) — the one place that knows how a conversation key is
 * shaped: `global`, `repo-<id>`, `app-<id>`, or a feature id.
 */

import { describe, it, expect } from 'vitest';
import {
  CHAT_SCOPE_ENV_VAR,
  GLOBAL_CHAT_SCOPE,
  chatScopeEnvironment,
  chatScopeForRepository,
  chatScopeKind,
  isChatScopeKey,
} from '@/domain/shared/chat-scope.js';
import { featureIdForApplication } from '@/domain/shared/feature-id.js';
import { ChatScopeKind } from '@/domain/generated/output.js';

describe('chat scopes', () => {
  it('classifies every scope shape', () => {
    expect(chatScopeKind(GLOBAL_CHAT_SCOPE)).toBe(ChatScopeKind.Global);
    expect(chatScopeKind(chatScopeForRepository('r1'))).toBe(ChatScopeKind.Repository);
    expect(chatScopeKind(featureIdForApplication('a1'))).toBe(ChatScopeKind.Application);
    expect(chatScopeKind('4f7c9a1e-2b3d-4c5e-8f90-123456789abc')).toBe(ChatScopeKind.Feature);
  });

  it('builds the repository scope used by the repository drawer', () => {
    expect(chatScopeForRepository('r1')).toBe('repo-r1');
  });

  it.each(['global', 'repo-r1', 'app-a1', 'feat_123', '4f7c9a1e-2b3d-4c5e-8f90-123456789abc'])(
    'accepts %s',
    (key) => {
      expect(isChatScopeKey(key)).toBe(true);
    }
  );

  it.each(['', ' ', '../etc', 'a/b', 'has space', 'x'.repeat(201)])('rejects %j', (key) => {
    expect(isChatScopeKey(key)).toBe(false);
  });

  it('puts the scope in the session environment', () => {
    expect(chatScopeEnvironment('repo-r1')).toEqual({
      set: { [CHAT_SCOPE_ENV_VAR]: 'repo-r1' },
      unset: [],
    });
    expect(CHAT_SCOPE_ENV_VAR).toBe('SHEP_CHAT_SCOPE');
  });
});
