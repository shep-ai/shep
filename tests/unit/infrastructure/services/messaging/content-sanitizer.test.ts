/**
 * Content Sanitizer Unit Tests
 *
 * Tests for the sanitization of outbound messaging content
 * to prevent leaking sensitive information (paths, env vars, code)
 * through third-party messaging platforms.
 */

import { describe, it, expect } from 'vitest';
import { sanitizeForMessaging } from '@/infrastructure/services/messaging/content-sanitizer.js';

describe('sanitizeForMessaging', () => {
  it('should strip Unix absolute file paths', () => {
    const result = sanitizeForMessaging('Error at /Users/john/projects/my-app/src/index.ts');
    expect(result).toBe('Error at [path]');
  });

  it('should strip Windows file paths', () => {
    const result = sanitizeForMessaging('Error at C:\\Users\\john\\projects\\app.ts');
    expect(result).toBe('Error at [path]');
  });

  it('should strip environment variable assignments', () => {
    const result = sanitizeForMessaging('Using API_KEY=test-value');
    expect(result).toBe('Using [env]');
  });

  it('should strip fenced code blocks', () => {
    const input = 'Here is the fix:\n```typescript\nconst x = 1;\n```\nDone.';
    const result = sanitizeForMessaging(input);
    expect(result).toBe('Here is the fix:\n[code block]\nDone.');
  });

  it('should strip long inline code', () => {
    const longCode = `\`${'a'.repeat(150)}\``;
    const result = sanitizeForMessaging(`Check this: ${longCode}`);
    expect(result).toBe('Check this: [code]');
  });

  it('should truncate messages exceeding 4000 characters', () => {
    const longMessage = 'a'.repeat(5000);
    const result = sanitizeForMessaging(longMessage);
    expect(result.length).toBe(4000);
    expect(result.endsWith('...')).toBe(true);
  });

  it('should preserve normal text without sensitive content', () => {
    const text = 'Feature "add payments" completed successfully. PR #42 ready for review.';
    const result = sanitizeForMessaging(text);
    expect(result).toBe(text);
  });

  it('should handle empty strings', () => {
    expect(sanitizeForMessaging('')).toBe('');
  });

  it('should handle messages exactly at the limit', () => {
    const text = 'a'.repeat(4000);
    const result = sanitizeForMessaging(text);
    expect(result).toBe(text);
  });
});
