/**
 * Cursor CLI facts — the model-name map is shared by the one-shot and interactive
 * Cursor executors so both send the same `cursor-agent` model id.
 */

import { describe, it, expect } from 'vitest';
import { toCursorModelName } from '@/infrastructure/services/agents/common/executors/cursor-cli.js';

describe('toCursorModelName', () => {
  it.each([
    ['composer-1.5', 'composer-2.5'],
    ['claude-opus-5-5', 'claude-opus-5-5-medium'],
    ['claude-opus-4-8', 'claude-opus-4-8-high'],
    ['claude-sonnet-4-6', 'claude-4.6-sonnet-medium'],
    ['gemini-3.1-pro-preview', 'gemini-3.1-pro'],
  ])('maps the legacy id %s to %s', (legacy, cursorId) => {
    expect(toCursorModelName(legacy)).toBe(cursorId);
  });

  it.each(['auto', 'composer-2.5', 'gpt-5.3-codex'])(
    'passes the live catalog id %s through unchanged',
    (id) => {
      expect(toCursorModelName(id)).toBe(id);
    }
  );
});
