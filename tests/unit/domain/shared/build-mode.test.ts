import { describe, it, expect } from 'vitest';
import { normalizeBuildMode } from '@/domain/shared/build-mode.js';
import { BuildMode } from '@/domain/generated/output.js';

describe('normalizeBuildMode', () => {
  it('maps the legacy capitalized settings labels onto BuildMode values', () => {
    expect(normalizeBuildMode('Fast')).toBe(BuildMode.Fast);
    expect(normalizeBuildMode('Regular')).toBe(BuildMode.Spec);
    expect(normalizeBuildMode('Exploration')).toBe(BuildMode.Exploration);
  });

  it('passes through canonical BuildMode values unchanged', () => {
    expect(normalizeBuildMode(BuildMode.Fast)).toBe(BuildMode.Fast);
    expect(normalizeBuildMode(BuildMode.Spec)).toBe(BuildMode.Spec);
    expect(normalizeBuildMode(BuildMode.Application)).toBe(BuildMode.Application);
    expect(normalizeBuildMode(BuildMode.Exploration)).toBe(BuildMode.Exploration);
  });

  it('is case and whitespace insensitive', () => {
    expect(normalizeBuildMode('  SPEC ')).toBe(BuildMode.Spec);
    expect(normalizeBuildMode('fAsT')).toBe(BuildMode.Fast);
  });

  it('falls back to Fast for missing or unknown values', () => {
    expect(normalizeBuildMode(undefined)).toBe(BuildMode.Fast);
    expect(normalizeBuildMode(null)).toBe(BuildMode.Fast);
    expect(normalizeBuildMode('')).toBe(BuildMode.Fast);
    expect(normalizeBuildMode('nonsense')).toBe(BuildMode.Fast);
  });

  it('honours an explicit fallback', () => {
    expect(normalizeBuildMode(undefined, BuildMode.Spec)).toBe(BuildMode.Spec);
    expect(normalizeBuildMode('nonsense', BuildMode.Spec)).toBe(BuildMode.Spec);
  });
});
