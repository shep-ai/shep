import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  parseExpansion,
  loadExpansion,
  saveExpansion,
  toggleInSet,
  SESSION_TREE_STORAGE_KEY,
} from '@/components/features/session-tree/session-tree-expansion';

describe('parseExpansion', () => {
  it('returns empty state for null', () => {
    expect(parseExpansion(null)).toEqual({ repositories: [], features: [] });
  });

  it('returns empty state for an empty string', () => {
    expect(parseExpansion('')).toEqual({ repositories: [], features: [] });
  });

  it('returns empty state for malformed JSON rather than throwing', () => {
    expect(parseExpansion('{not json')).toEqual({ repositories: [], features: [] });
  });

  it('returns empty state for a JSON primitive', () => {
    expect(parseExpansion('42')).toEqual({ repositories: [], features: [] });
  });

  it('parses stored repositories and features', () => {
    const raw = JSON.stringify({ repositories: ['/code/a'], features: ['feat-1'] });

    expect(parseExpansion(raw)).toEqual({ repositories: ['/code/a'], features: ['feat-1'] });
  });

  it('drops non-string entries', () => {
    const raw = JSON.stringify({ repositories: ['/code/a', 7, null], features: 'nope' });

    expect(parseExpansion(raw)).toEqual({ repositories: ['/code/a'], features: [] });
  });
});

describe('loadExpansion / saveExpansion', () => {
  // The shared web test setup stubs localStorage with non-storing mocks, so
  // give this block a real in-memory implementation to round-trip against.
  beforeEach(() => {
    const store = new Map<string, string>();
    vi.spyOn(window.localStorage, 'getItem').mockImplementation(
      (k: string) => store.get(k) ?? null
    );
    vi.spyOn(window.localStorage, 'setItem').mockImplementation((k: string, v: string) => {
      store.set(k, v);
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('round-trips expansion state', () => {
    saveExpansion({ repositories: ['/code/a'], features: ['feat-1'] });

    expect(loadExpansion()).toEqual({ repositories: ['/code/a'], features: ['feat-1'] });
  });

  it('defaults to collapsed when nothing is stored', () => {
    expect(loadExpansion()).toEqual({ repositories: [], features: [] });
  });

  it('writes under the documented storage key', () => {
    saveExpansion({ repositories: ['/x'], features: [] });

    expect(window.localStorage.getItem(SESSION_TREE_STORAGE_KEY)).toContain('/x');
  });

  it('does not throw when storage rejects writes', () => {
    const spy = vi.spyOn(window.localStorage, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });

    expect(() => saveExpansion({ repositories: ['/x'], features: [] })).not.toThrow();
    spy.mockRestore();
  });

  it('does not throw when storage rejects reads', () => {
    const spy = vi.spyOn(window.localStorage, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError');
    });

    expect(loadExpansion()).toEqual({ repositories: [], features: [] });
    spy.mockRestore();
  });
});

describe('toggleInSet', () => {
  it('adds a missing id', () => {
    expect([...toggleInSet(new Set(), 'a')]).toEqual(['a']);
  });

  it('removes a present id', () => {
    expect([...toggleInSet(new Set(['a']), 'a')]).toEqual([]);
  });

  it('does not mutate the input set', () => {
    const original = new Set(['a']);
    toggleInSet(original, 'b');

    expect([...original]).toEqual(['a']);
  });
});
