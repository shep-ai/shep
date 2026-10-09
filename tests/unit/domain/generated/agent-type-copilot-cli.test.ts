/**
 * AgentType.CopilotCli Enum Validation Test
 *
 * Verifies the CopilotCli variant exists in the AgentType enum
 * with the correct string value after TypeSpec compilation.
 */

import { describe, it, expect } from 'vitest';
import { AgentType } from '@/domain/generated/output.js';

describe('AgentType.CopilotCli', () => {
  it('should have CopilotCli variant with value "copilot-cli"', () => {
    expect(AgentType.CopilotCli).toBe('copilot-cli');
  });

  it('should not break existing enum variants', () => {
    expect(AgentType.ClaudeCode).toBe('claude-code');
    expect(AgentType.CodexCli).toBe('codex-cli');
    expect(AgentType.GeminiCli).toBe('gemini-cli');
    expect(AgentType.Cursor).toBe('cursor');
    expect(AgentType.Dev).toBe('dev');
  });
});
