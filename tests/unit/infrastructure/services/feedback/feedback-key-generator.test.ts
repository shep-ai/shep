import { describe, it, expect } from 'vitest';
import {
  FEEDBACK_KEY_PREFIX,
  FeedbackKeyGenerator,
} from '@/infrastructure/services/feedback/feedback-key-generator.js';

describe('FeedbackKeyGenerator', () => {
  it('makes distinct prefixed keys whose hash it reproduces', () => {
    const generator = new FeedbackKeyGenerator();
    const a = generator.generate();
    const b = generator.generate();
    expect(a.secret.startsWith(FEEDBACK_KEY_PREFIX)).toBe(true);
    expect(a.secret).not.toBe(b.secret);
    expect(a.secret.startsWith(a.prefix)).toBe(true);
    expect(a.prefix.length).toBeLessThan(a.secret.length);
    expect(a.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(generator.hash(a.secret)).toBe(a.hash);
    expect(a.hash).not.toContain(a.secret);
  });
});
