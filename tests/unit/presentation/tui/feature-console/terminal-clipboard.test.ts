/**
 * OSC 52 clipboard Unit Tests (spec 145)
 *
 * TDD Phase: RED-GREEN-REFACTOR
 */

import { describe, it, expect } from 'vitest';
import { clipboardSequence } from '@/presentation/tui/feature-console/terminal-clipboard.js';

describe('clipboardSequence', () => {
  it('encodes the text as base64 in an OSC 52 sequence for the clipboard', () => {
    expect(clipboardSequence('feat-1234')).toBe(
      `\x1b]52;c;${Buffer.from('feat-1234').toString('base64')}\x07`
    );
  });

  it('carries non-ASCII text intact', () => {
    const payload = clipboardSequence('ñ ◆').slice('\x1b]52;c;'.length, -1);
    expect(Buffer.from(payload, 'base64').toString('utf8')).toBe('ñ ◆');
  });
});
