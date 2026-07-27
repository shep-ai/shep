import { describe, it, expect } from 'vitest';
import { getModelMeta } from '@/lib/model-metadata';

describe('getModelMeta', () => {
  it('returns metadata for Claude Opus 5', () => {
    const meta = getModelMeta('claude-opus-5');

    expect(meta.displayName).toBe('Opus 5');
    expect(meta.description).not.toBe('');
  });

  it('returns metadata for Claude Sonnet 5', () => {
    const meta = getModelMeta('claude-sonnet-5');

    expect(meta.displayName).toBe('Sonnet 5');
    expect(meta.description).not.toBe('');
  });

  it('falls back to a prettified id for unknown models', () => {
    const meta = getModelMeta('claude-unknown-model');

    expect(meta.displayName).toBe('Unknown Model');
    expect(meta.description).toBe('');
  });
});
