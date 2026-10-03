import { describe, it, expect } from 'vitest';

describe('intent tokens (spec 119)', () => {
  it('drops function words, stems, and splits camelCase identifiers', async () => {
    const { intentTokens, stemToken, intentOverlapScore } = await import(
      '@/domain/shared/lexical-relevance.js'
    );
    expect([...intentTokens('Editing the refreshToken handlers')].sort()).toEqual([
      'edit',
      'handler',
      'refresh',
      'token',
    ]);
    expect(stemToken('policies')).toBe('policy');
    expect(stemToken('bus')).toBe('bus');
    expect(intentOverlapScore(intentTokens('edit the file'), 'show git status or the diff')).toBe(
      0
    );
    expect(
      intentOverlapScore(intentTokens('usages of parseDate'), 'symbol usage reference')
    ).toBeGreaterThan(0);
  });
});
