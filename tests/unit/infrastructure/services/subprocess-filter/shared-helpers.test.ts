import { describe, it, expect } from 'vitest';
import {
  stripAnsi,
  collapseBlankLines,
  deduplicateLines,
  truncateMiddle,
} from '@/infrastructure/services/subprocess-filter/filters/shared-helpers.js';

describe('stripAnsi', () => {
  it('removes SGR escape sequences', () => {
    expect(stripAnsi('\x1b[31mred\x1b[0m')).toBe('red');
  });

  it('handles multiple sequences', () => {
    expect(stripAnsi('\x1b[1m\x1b[32mgreen bold\x1b[0m')).toBe('green bold');
  });

  it('passes through plain text unchanged', () => {
    expect(stripAnsi('hello world')).toBe('hello world');
  });
});

describe('collapseBlankLines', () => {
  it('collapses 3+ blank lines into one', () => {
    const input = 'a\n\n\n\n\nb';
    expect(collapseBlankLines(input)).toBe('a\n\n\nb');
  });

  it('preserves single blank lines', () => {
    expect(collapseBlankLines('a\n\nb')).toBe('a\n\nb');
  });

  it('preserves double blank lines', () => {
    expect(collapseBlankLines('a\n\n\nb')).toBe('a\n\n\nb');
  });

  it('trims trailing whitespace from lines', () => {
    expect(collapseBlankLines('a   \nb')).toBe('a\nb');
  });
});

describe('deduplicateLines', () => {
  it('deduplicates consecutive identical lines', () => {
    expect(deduplicateLines('ok\nok\nok\nfail')).toBe('ok (×3)\nfail');
  });

  it('does not deduplicate non-consecutive lines', () => {
    expect(deduplicateLines('a\nb\na')).toBe('a\nb\na');
  });

  it('handles single-line input', () => {
    expect(deduplicateLines('hello')).toBe('hello');
  });

  it('handles empty input', () => {
    expect(deduplicateLines('')).toBe('');
  });
});

describe('truncateMiddle', () => {
  it('returns short text unchanged', () => {
    const text = 'a\nb\nc';
    expect(truncateMiddle(text, 10)).toBe(text);
  });

  it('truncates long text keeping top and bottom', () => {
    const lines = Array.from({ length: 100 }, (_, i) => `line ${i}`);
    const result = truncateMiddle(lines.join('\n'), 20);
    const resultLines = result.split('\n');

    expect(resultLines.length).toBe(20);
    expect(resultLines[0]).toBe('line 0');
    expect(resultLines[resultLines.length - 1]).toBe('line 99');
    expect(result).toContain('lines omitted');
  });

  it('preserves exact line count when at limit', () => {
    const lines = Array.from({ length: 20 }, (_, i) => `line ${i}`);
    expect(truncateMiddle(lines.join('\n'), 20)).toBe(lines.join('\n'));
  });
});
