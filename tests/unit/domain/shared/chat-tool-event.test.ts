/**
 * Chat tool event rows Unit Tests (spec 147)
 *
 * The interactive session stores each tool call as an assistant row
 * `**label** \`detail\``; readers parse it with the same helper.
 *
 * TDD Phase: RED-GREEN-REFACTOR
 */

import { describe, it, expect } from 'vitest';
import { formatToolEventMessage, parseToolEventMessage } from '@/domain/shared/chat-tool-event.js';

describe('chat tool event rows', () => {
  it('round-trips a label with and without a detail', () => {
    expect(formatToolEventMessage('Read', 'src/app.ts')).toBe('**Read** `src/app.ts`');
    expect(formatToolEventMessage('Thinking')).toBe('**Thinking**');
    expect(parseToolEventMessage('**Read** `src/app.ts`')).toEqual({
      label: 'Read',
      detail: 'src/app.ts',
    });
    expect(parseToolEventMessage('**Thinking**')).toEqual({ label: 'Thinking' });
  });

  it('keeps multi-line details and backticks inside them', () => {
    expect(parseToolEventMessage('**Bash** `echo `x`\nls`')).toEqual({
      label: 'Bash',
      detail: 'echo `x`\nls',
    });
  });

  it('is not fooled by prose that only starts in bold', () => {
    expect(parseToolEventMessage('**Note** the build is green.')).toBeNull();
    expect(parseToolEventMessage('Plain text')).toBeNull();
  });
});
