import { describe, it, expect } from 'vitest';
import { filterGeneric } from '@/infrastructure/services/subprocess-filter/filters/generic-filter.js';

describe('filterGeneric', () => {
  it('strips ANSI codes', () => {
    expect(filterGeneric('\x1b[32mgreen\x1b[0m')).toBe('green');
  });

  it('deduplicates consecutive identical lines', () => {
    const input = 'ok\nok\nok\ndone';
    expect(filterGeneric(input)).toContain('ok (×3)');
  });

  it('collapses blank line runs', () => {
    const input = 'a\n\n\n\n\nb';
    const result = filterGeneric(input);
    // Should have at most 2 consecutive blank lines
    expect(result.includes('\n\n\n\n')).toBe(false);
  });

  it('truncates very long output', () => {
    const lines = Array.from({ length: 500 }, (_, i) => `line ${i}`);
    const result = filterGeneric(lines.join('\n'));
    expect(result.split('\n').length).toBeLessThanOrEqual(150);
    expect(result).toContain('lines omitted');
  });

  it('returns empty string for empty input', () => {
    expect(filterGeneric('')).toBe('');
    expect(filterGeneric('   ')).toBe('');
  });
});
