/**
 * Chat scopes (spec 137).
 *
 * A chat conversation is keyed by one scope string, stored in the `feature_id`
 * column of `interactive_messages`: `global`, `repo-<repository id>`,
 * `app-<application id>`, or a feature id. This module is the one place that
 * knows those shapes.
 *
 * Pure; extensionless imports (consumed by the web bundle as raw source).
 */

import { ChatScopeKind } from '../generated/output';
import { isApplicationFeatureId } from './feature-id';
import type { SpaceEnvironment } from './space-environment';

/** The Shep-wide conversation. */
export const GLOBAL_CHAT_SCOPE = 'global';

/** Environment variable that tells a chat agent's tools which conversation it is in. */
export const CHAT_SCOPE_ENV_VAR = 'SHEP_CHAT_SCOPE';

const REPOSITORY_CHAT_SCOPE_PREFIX = 'repo-';

/** Letters, digits, `.`, `_` and `-` only: a scope is also a URL segment. */
const CHAT_SCOPE_KEY_PATTERN = /^[A-Za-z0-9._-]{1,200}$/;
const PARENT_SEGMENT = '..';

export function chatScopeForRepository(repositoryId: string): string {
  return `${REPOSITORY_CHAT_SCOPE_PREFIX}${repositoryId}`;
}

export function chatScopeKind(scope: string): ChatScopeKind {
  if (scope === GLOBAL_CHAT_SCOPE) return ChatScopeKind.Global;
  if (scope.startsWith(REPOSITORY_CHAT_SCOPE_PREFIX)) return ChatScopeKind.Repository;
  if (isApplicationFeatureId(scope)) return ChatScopeKind.Application;
  return ChatScopeKind.Feature;
}

export function isChatScopeKey(value: string): boolean {
  return CHAT_SCOPE_KEY_PATTERN.test(value) && !value.includes(PARENT_SEGMENT);
}

/** The session environment that names the conversation (merged with the space environment). */
export function chatScopeEnvironment(scope: string): SpaceEnvironment {
  return { set: { [CHAT_SCOPE_ENV_VAR]: scope }, unset: [] };
}
