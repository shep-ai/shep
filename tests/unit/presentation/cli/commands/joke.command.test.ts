// @vitest-environment node

/**
 * Joke Command Unit Tests
 *
 * Tests for the `shep joke` command.
 *
 * TDD Phase: RED → GREEN → REFACTOR
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Command } from 'commander';

// --- Mocks ---

vi.mock('@cli/presentation/cli/ui/index.js', () => ({
  messages: {
    newline: vi.fn(),
    log: vi.fn(),
  },
  colors: {
    muted: (s: string) => s,
    accent: (s: string) => s,
  },
  fmt: {
    heading: (s: string) => s,
  },
}));

// Import after mocks
import { createJokeCommand } from '@cli/presentation/cli/commands/joke.command.js';
import { messages } from '@cli/presentation/cli/ui/index.js';

describe('Joke Command', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('command structure', () => {
    it('should return a Commander Command with name "joke"', () => {
      const cmd = createJokeCommand();
      expect(cmd).toBeInstanceOf(Command);
      expect(cmd.name()).toBe('joke');
    });

    it('should have a description', () => {
      const cmd = createJokeCommand();
      expect(cmd.description()).toBe('Display a random programming joke');
    });
  });

  describe('action', () => {
    it('should print a joke when invoked', async () => {
      const cmd = createJokeCommand();
      await cmd.parseAsync(['node', 'test']);

      expect(messages.newline).toHaveBeenCalled();
      expect(messages.log).toHaveBeenCalled();
    });

    it('should print a string that is not empty', async () => {
      const cmd = createJokeCommand();
      await cmd.parseAsync(['node', 'test']);

      const logCalls = vi.mocked(messages.log).mock.calls;
      // At least one log call should contain non-empty text
      const hasContent = logCalls.some(([text]) => text.trim().length > 0);
      expect(hasContent).toBe(true);
    });

    it('should print different jokes on repeated calls (statistical)', async () => {
      const jokes = new Set<string>();

      for (let i = 0; i < 20; i++) {
        vi.clearAllMocks();
        const cmd = createJokeCommand();
        await cmd.parseAsync(['node', 'test']);

        const logCalls = vi.mocked(messages.log).mock.calls;
        const output = logCalls.map(([text]) => text).join('\n');
        jokes.add(output);
      }

      // With 20 tries and multiple jokes, we should see at least 2 different ones
      expect(jokes.size).toBeGreaterThan(1);
    });
  });
});
