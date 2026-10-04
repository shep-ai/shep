import { describe, it, expect } from 'vitest';
import { workItemKey } from '@/domain/shared/work-item-key.js';

describe('workItemKey', () => {
  it('joins the project prefix and the sequence number', () => {
    expect(workItemKey({ identifierPrefix: 'PAY', sequenceId: 42 })).toBe('PAY-42');
  });
});
