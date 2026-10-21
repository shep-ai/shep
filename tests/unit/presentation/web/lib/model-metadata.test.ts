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

  it.each([
    ['claude-opus-6-5', 'Opus 6.5'],
    ['claude-opus-6', 'Opus 6'],
    ['claude-haiku-4-5-20251001', 'Haiku 4.5'],
    ['claude-mythos-5-1', 'Mythos 5.1'],
  ])('renders unlisted Claude id %s as a dotted version', (id, displayName) => {
    const meta = getModelMeta(id);

    expect(meta.displayName).toBe(displayName);
    expect(meta.description).toBe('');
  });

  it('falls back to a prettified id for unknown models', () => {
    const meta = getModelMeta('claude-unknown-model');

    expect(meta.displayName).toBe('Unknown Model');
    expect(meta.description).toBe('');
  });

  it.each([
    ['auto', 'Auto'],
    ['composer-2.5', 'Composer 2.5'],
    ['composer-2.5-fast', 'Composer 2.5 Fast'],
  ])('returns display metadata for Cursor id %s', (id, displayName) => {
    const meta = getModelMeta(id);

    expect(meta.displayName).toBe(displayName);
    expect(meta.description).not.toBe('');
  });
});

describe('getModelMeta curated Claude entries', () => {
  it.each([
    ['claude-opus-5-5', 'Opus 5.5'],
    ['claude-fable-5-1', 'Fable 5.1'],
  ])('has a curated description for %s', (id, displayName) => {
    const meta = getModelMeta(id);

    expect(meta.displayName).toBe(displayName);
    expect(meta.description).not.toBe('');
  });
});

describe('getModelMeta GPT-5.6 Codex entries', () => {
  it.each([
    ['gpt-5.6-sol', 'GPT-5.6 Sol'],
    ['gpt-5.6-terra', 'GPT-5.6 Terra'],
    ['gpt-5.6-luna', 'GPT-5.6 Luna'],
  ])('has a curated description for %s', (id, displayName) => {
    const meta = getModelMeta(id);

    expect(meta.displayName).toBe(displayName);
    expect(meta.description).not.toBe('');
  });

  it('no longer calls GPT-5.4 the Codex flagship', () => {
    expect(getModelMeta('gpt-5.4').description).not.toMatch(/flagship/i);
  });
});
