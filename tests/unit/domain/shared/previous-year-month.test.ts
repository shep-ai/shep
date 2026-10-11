import { describe, it, expect } from 'vitest';
import { previousYearMonth } from '@/domain/shared/previous-year-month.js';

describe('previousYearMonth', () => {
  it('rolls back into the previous month', () => {
    expect(previousYearMonth(new Date('2026-05-15T12:00:00Z'))).toBe('2026-04');
  });

  it('rolls back across the year boundary', () => {
    expect(previousYearMonth(new Date('2026-01-01T00:00:00Z'))).toBe('2025-12');
  });
});
