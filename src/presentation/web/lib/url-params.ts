/**
 * Centralized URL search-param keys for the /create parallel-slot drawer.
 *
 * Every callsite that reads or writes a /create query string MUST import
 * from here instead of using inline string literals — this is the single
 * source of truth (no magic values; see .claude/rules/code-quality.md).
 */

import type { Route } from 'next';

export const URL_PARAMS = {
  repo: 'repo',
  parent: 'parent',
  prompt: 'prompt',
  mode: 'mode',
  applicationId: 'applicationId',
} as const;

export type UrlParam = (typeof URL_PARAMS)[keyof typeof URL_PARAMS];

export interface CreateUrlParams {
  repo?: string;
  parent?: string;
  prompt?: string;
  mode?: string;
  applicationId?: string;
}

/**
 * Builds a `/create?...` URL from the given param object. Empty / undefined
 * values are skipped. All values are URL-encoded. Cast to `Route` so
 * Next's typed-routes accept the dynamic query string at router.push().
 */
export function buildCreateUrl(params: CreateUrlParams = {}): Route {
  const search = new URLSearchParams();
  if (params.repo) search.set(URL_PARAMS.repo, params.repo);
  if (params.parent) search.set(URL_PARAMS.parent, params.parent);
  if (params.prompt) search.set(URL_PARAMS.prompt, params.prompt);
  if (params.mode) search.set(URL_PARAMS.mode, params.mode);
  if (params.applicationId) search.set(URL_PARAMS.applicationId, params.applicationId);
  const qs = search.toString();
  return (qs ? `/create?${qs}` : '/create') as Route;
}
