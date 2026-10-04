import { describe, it, expect } from 'vitest';
import {
  inferSpaceRuleKind,
  DEFAULT_SPACE_ID,
  normalizeRemoteUrlForSpace,
  normalizeSpaceRulePattern,
  matchSpaceRule,
  resolveSpace,
  spacePathKey,
  type SpaceRuleInput,
} from '@/domain/shared/space-resolution.js';
import { SpaceResolutionSource, SpaceRuleKind } from '@/domain/generated/output.js';

function rule(overrides: Partial<SpaceRuleInput>): SpaceRuleInput {
  return {
    id: 'rule-1',
    spaceId: 'space-a',
    kind: SpaceRuleKind.Path,
    pattern: '/code/acme',
    priority: 100,
    ...overrides,
  };
}

describe('inferSpaceRuleKind', () => {
  it.each(['/work/acme', 'C:\\work\\acme', 'c:/work', '\\\\server\\share'])(
    'treats the absolute path %s as a Path rule',
    (pattern) => {
      expect(inferSpaceRuleKind(pattern)).toBe(SpaceRuleKind.Path);
    }
  );

  it.each(['github.com/acme/*', 'git@github.com:acme/api.git', 'https://gitlab.com/acme/**'])(
    'treats %s as a Remote rule',
    (pattern) => {
      expect(inferSpaceRuleKind(pattern)).toBe(SpaceRuleKind.Remote);
    }
  );
});

describe('normalizeRemoteUrlForSpace', () => {
  it.each([
    ['https://github.com/Acme/Repo.git', 'github.com/acme/repo'],
    ['https://github.com/acme/repo', 'github.com/acme/repo'],
    ['git@github.com:Acme/Repo.git', 'github.com/acme/repo'],
    ['ssh://git@github.com/acme/repo.git', 'github.com/acme/repo'],
    ['https://user:token@gitlab.example.com/group/sub/repo/', 'gitlab.example.com/group/sub/repo'],
    ['github.com/acme/repo', 'github.com/acme/repo'],
  ])('normalizes %s to %s', (input, expected) => {
    expect(normalizeRemoteUrlForSpace(input)).toBe(expected);
  });

  it('returns an empty string for blank input', () => {
    expect(normalizeRemoteUrlForSpace('  ')).toBe('');
  });
});

describe('normalizeSpaceRulePattern', () => {
  it('normalizes a path pattern like a repository path', () => {
    expect(normalizeSpaceRulePattern(SpaceRuleKind.Path, 'C:\\Code\\Acme\\')).toBe('c:/Code/Acme');
  });

  it('normalizes a remote pattern like a remote url, keeping wildcards', () => {
    expect(normalizeSpaceRulePattern(SpaceRuleKind.Remote, 'https://GitHub.com/Acme/*')).toBe(
      'github.com/acme/*'
    );
  });
});

describe('spacePathKey', () => {
  it('folds Windows paths to lower case and keeps POSIX paths exact', () => {
    expect(spacePathKey('C:\\Code\\Acme\\')).toBe('c:/code/acme');
    expect(spacePathKey('/Code/Acme/')).toBe('/Code/Acme');
  });
});

describe('matchSpaceRule', () => {
  describe('path rules', () => {
    it('matches the exact path and any path below it', () => {
      const r = rule({ pattern: '/code/acme' });
      expect(matchSpaceRule(r, '/code/acme')).not.toBeNull();
      expect(matchSpaceRule(r, '/code/acme/payments-api')).not.toBeNull();
    });

    it('matches whole path segments only', () => {
      expect(matchSpaceRule(rule({ pattern: '/code/acme' }), '/code/acme-fork')).toBeNull();
    });

    it('ignores trailing slashes and backslashes', () => {
      expect(matchSpaceRule(rule({ pattern: '/code/acme/' }), '\\code\\acme\\api')).not.toBeNull();
    });

    it('compares Windows drive letters case-insensitively', () => {
      expect(matchSpaceRule(rule({ pattern: 'c:/code/acme' }), 'C:/code/acme/api')).not.toBeNull();
    });

    it('compares a whole Windows path case-insensitively', () => {
      expect(
        matchSpaceRule(rule({ pattern: 'C:/Code/Acme' }), 'c:\\code\\ACME\\api')
      ).not.toBeNull();
      expect(
        matchSpaceRule(rule({ pattern: '//server/Share/Acme' }), '//SERVER/share/acme/x')
      ).not.toBeNull();
    });

    it('stays case-sensitive for POSIX paths', () => {
      expect(matchSpaceRule(rule({ pattern: '/code/Acme' }), '/code/acme/api')).toBeNull();
    });

    it('scores a deeper prefix as more specific', () => {
      const shallow = matchSpaceRule(rule({ pattern: '/code' }), '/code/acme/api');
      const deep = matchSpaceRule(rule({ pattern: '/code/acme' }), '/code/acme/api');
      expect(deep).toBeGreaterThan(shallow ?? Infinity);
    });
  });

  describe('remote rules', () => {
    const remote = (pattern: string) => rule({ kind: SpaceRuleKind.Remote, pattern });

    it('matches a single-segment wildcard', () => {
      expect(
        matchSpaceRule(remote('github.com/acme/*'), '/x', 'git@github.com:Acme/Api.git')
      ).not.toBeNull();
    });

    it('does not let * cross a segment', () => {
      expect(
        matchSpaceRule(remote('github.com/*'), '/x', 'https://github.com/acme/api')
      ).toBeNull();
    });

    it('lets ** match any number of segments', () => {
      expect(
        matchSpaceRule(remote('gitlab.example.com/**'), '/x', 'https://gitlab.example.com/a/b/c')
      ).not.toBeNull();
    });

    it('supports * inside a segment', () => {
      const r = remote('github.com/acme/payments-*');
      expect(matchSpaceRule(r, '/x', 'https://github.com/acme/payments-api')).not.toBeNull();
      expect(matchSpaceRule(r, '/x', 'https://github.com/acme/billing-api')).toBeNull();
    });

    it('never matches a repository without a remote', () => {
      expect(matchSpaceRule(remote('github.com/acme/*'), '/x', undefined)).toBeNull();
    });

    it('scores a more literal pattern as more specific', () => {
      const url = 'https://github.com/acme/payments-api';
      const broad = matchSpaceRule(remote('github.com/acme/*'), '/x', url);
      const narrow = matchSpaceRule(remote('github.com/acme/payments-api'), '/x', url);
      expect(narrow).toBeGreaterThan(broad ?? Infinity);
    });
  });
});

describe('resolveSpace', () => {
  const base = {
    repositoryPath: '/code/acme/payments-api',
    remoteUrl: 'https://github.com/acme/payments-api',
    defaultSpaceId: DEFAULT_SPACE_ID,
  };

  it('falls back to the default space when nothing matches', () => {
    expect(resolveSpace({ ...base, rules: [] })).toEqual({
      spaceId: DEFAULT_SPACE_ID,
      source: SpaceResolutionSource.Default,
    });
  });

  it('lets an assignment beat every rule', () => {
    const result = resolveSpace({
      ...base,
      assignment: { spaceId: 'space-personal' },
      rules: [rule({ spaceId: 'space-a', pattern: '/code/acme/payments-api' })],
    });
    expect(result).toEqual({ spaceId: 'space-personal', source: SpaceResolutionSource.Assignment });
  });

  it('carries the assignment product line', () => {
    const result = resolveSpace({
      ...base,
      assignment: { spaceId: 'space-a', productLineId: 'line-pay' },
      rules: [],
    });
    expect(result.productLineId).toBe('line-pay');
  });

  it('picks the most specific matching rule', () => {
    const result = resolveSpace({
      ...base,
      rules: [
        rule({ id: 'broad', spaceId: 'space-a', pattern: '/code' }),
        rule({ id: 'narrow', spaceId: 'space-b', productLineId: 'line-b', pattern: '/code/acme' }),
      ],
    });
    expect(result).toEqual({
      spaceId: 'space-b',
      productLineId: 'line-b',
      source: SpaceResolutionSource.Rule,
      ruleId: 'narrow',
    });
  });

  it('breaks a specificity tie by lower priority, then by rule id', () => {
    const tie = [
      rule({ id: 'z', spaceId: 'space-z', pattern: '/code/acme', priority: 5 }),
      rule({ id: 'a', spaceId: 'space-a', pattern: '/code/acme', priority: 5 }),
      rule({ id: 'm', spaceId: 'space-m', pattern: '/code/acme', priority: 50 }),
    ];
    expect(resolveSpace({ ...base, rules: tie }).ruleId).toBe('a');
  });

  it('resolves through a remote rule when no path rule matches', () => {
    const result = resolveSpace({
      ...base,
      rules: [rule({ id: 'gh', kind: SpaceRuleKind.Remote, pattern: 'github.com/acme/*' })],
    });
    expect(result.ruleId).toBe('gh');
  });
});
