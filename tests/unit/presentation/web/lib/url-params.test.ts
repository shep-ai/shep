import { describe, it, expect } from 'vitest';
import { URL_PARAMS, buildCreateUrl, type UrlParam } from '@/lib/url-params';

describe('URL_PARAMS', () => {
  it('exposes all five /create query keys with their canonical values', () => {
    expect(URL_PARAMS).toEqual({
      repo: 'repo',
      parent: 'parent',
      prompt: 'prompt',
      mode: 'mode',
      applicationId: 'applicationId',
    });
  });

  it('produces a UrlParam union covering each key value', () => {
    const keys: UrlParam[] = [
      URL_PARAMS.repo,
      URL_PARAMS.parent,
      URL_PARAMS.prompt,
      URL_PARAMS.mode,
      URL_PARAMS.applicationId,
    ];
    expect(keys).toHaveLength(5);
  });
});

describe('buildCreateUrl', () => {
  it('returns "/create" when no params are provided', () => {
    expect(buildCreateUrl()).toBe('/create');
    expect(buildCreateUrl({})).toBe('/create');
  });

  it('encodes a repo path', () => {
    expect(buildCreateUrl({ repo: '/Users/me/repo' })).toBe('/create?repo=%2FUsers%2Fme%2Frepo');
  });

  it('skips undefined and empty values', () => {
    expect(buildCreateUrl({ repo: '/x', parent: undefined, prompt: '' })).toBe('/create?repo=%2Fx');
  });

  it('combines multiple params in URL_PARAMS key order', () => {
    const url = buildCreateUrl({
      repo: '/x',
      parent: 'feat-1',
      mode: 'spec',
      applicationId: 'app-1',
    });
    expect(url).toBe('/create?repo=%2Fx&parent=feat-1&mode=spec&applicationId=app-1');
  });

  it('encodes special characters in prompt', () => {
    expect(buildCreateUrl({ prompt: 'hello world & friends' })).toBe(
      '/create?prompt=hello+world+%26+friends'
    );
  });
});
