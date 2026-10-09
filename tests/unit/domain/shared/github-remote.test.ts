import { describe, it, expect } from 'vitest';
import { listGitHubOwners, parseGitHubOwnerRepo } from '@/domain/shared/github-remote.js';

describe('parseGitHubOwnerRepo', () => {
  it('should parse HTTPS GitHub URLs', () => {
    expect(parseGitHubOwnerRepo('https://github.com/shep-ai/shep')).toEqual({
      owner: 'shep-ai',
      repo: 'shep',
    });
  });

  it('should parse HTTPS GitHub URLs with .git suffix', () => {
    expect(parseGitHubOwnerRepo('https://github.com/owner/repo.git')).toEqual({
      owner: 'owner',
      repo: 'repo',
    });
  });

  it('should parse SSH GitHub URLs', () => {
    expect(parseGitHubOwnerRepo('git@github.com:owner/repo.git')).toEqual({
      owner: 'owner',
      repo: 'repo',
    });
  });

  it('should parse SSH GitHub URLs without .git suffix', () => {
    expect(parseGitHubOwnerRepo('git@github.com:org/project')).toEqual({
      owner: 'org',
      repo: 'project',
    });
  });

  it('should return null for non-GitHub URLs', () => {
    expect(parseGitHubOwnerRepo('https://gitlab.com/owner/repo')).toBeNull();
  });

  it('should return null for invalid URLs', () => {
    expect(parseGitHubOwnerRepo('')).toBeNull();
    expect(parseGitHubOwnerRepo('not-a-url')).toBeNull();
  });
});

describe('listGitHubOwners', () => {
  it('returns each GitHub owner once, sorted, ignoring other hosts and blanks', () => {
    expect(
      listGitHubOwners([
        'https://github.com/zeta/one.git',
        'git@github.com:acme/two.git',
        'https://github.com/acme/three',
        'https://gitlab.com/elsewhere/repo',
        undefined,
        '',
      ])
    ).toEqual(['acme', 'zeta']);
  });

  it('treats owners case-insensitively, as GitHub does', () => {
    expect(listGitHubOwners(['https://github.com/Acme/a', 'https://github.com/acme/b'])).toEqual([
      'acme',
    ]);
  });
});
