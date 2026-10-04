import { describe, it, expect } from 'vitest';
import { defined, optionalText } from '@/domain/shared/defined.js';

describe('defined', () => {
  it('keeps only set entries', () => {
    expect(defined({ a: 1, b: undefined, c: null, d: '', e: 0, f: false })).toEqual({
      a: 1,
      d: '',
      e: 0,
      f: false,
    });
  });

  it('trims optional text and drops blanks', () => {
    expect(optionalText('  hi ')).toBe('hi');
    expect(optionalText('   ')).toBeUndefined();
    expect(optionalText(undefined)).toBeUndefined();
  });
});
