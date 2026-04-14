/**
 * Agent Config Wizard Unit Tests
 *
 * Tests for the interactive agent configuration wizard.
 *
 * TDD Phase: RED -> GREEN
 */

import 'reflect-metadata';
import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock @inquirer/prompts before importing the wizard
vi.mock('@inquirer/prompts', () => ({
  select: vi.fn(),
  password: vi.fn(),
}));

import { select, password } from '@inquirer/prompts';
import { agentConfigWizard } from '../../../../../src/presentation/tui/wizards/agent-config.wizard.js';

const mockSelect = select as ReturnType<typeof vi.fn>;
const mockPassword = password as ReturnType<typeof vi.fn>;

describe('agentConfigWizard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return correct result for session auth without prompting for token', async () => {
    mockSelect.mockResolvedValueOnce('claude-code'); // agent type
    mockSelect.mockResolvedValueOnce('session'); // auth method

    const result = await agentConfigWizard();

    expect(result).toEqual({
      type: 'claude-code',
      authMethod: 'session',
    });
    expect(result.token).toBeUndefined();
    expect(mockPassword).not.toHaveBeenCalled();
  });

  it('should return correct result for token auth including the token value', async () => {
    mockSelect.mockResolvedValueOnce('claude-code'); // agent type
    mockSelect.mockResolvedValueOnce('token'); // auth method
    mockPassword.mockResolvedValueOnce('sk-ant-test-key-123');

    const result = await agentConfigWizard();

    expect(result).toEqual({
      type: 'claude-code',
      authMethod: 'token',
      token: 'sk-ant-test-key-123',
    });
    expect(mockPassword).toHaveBeenCalledTimes(1);
    expect(mockPassword).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Enter your Anthropic API key',
        mask: '*',
      })
    );
  });

  it('should pass agent type and auth method from prompt results', async () => {
    mockSelect.mockResolvedValueOnce('claude-code'); // agent type
    mockSelect.mockResolvedValueOnce('session'); // auth method

    const result = await agentConfigWizard();

    expect(result.type).toBe('claude-code');
    expect(result.authMethod).toBe('session');

    // Verify select was called twice: first for agent, then for auth method
    expect(mockSelect).toHaveBeenCalledTimes(2);

    // First call: agent select config
    expect(mockSelect).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        message: 'Select your AI coding agent',
      })
    );

    // Second call: auth method config
    expect(mockSelect).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        message: 'Select authentication method',
      })
    );
  });

  it('should call prompts in the correct order', async () => {
    const callOrder: string[] = [];

    mockSelect.mockImplementation(async (config: { message: string }) => {
      callOrder.push(`select:${config.message}`);
      if (config.message === 'Select your AI coding agent') {
        return 'claude-code';
      }
      return 'session';
    });

    await agentConfigWizard();

    expect(callOrder).toEqual([
      'select:Select your AI coding agent',
      'select:Select authentication method',
    ]);
  });

  it('should skip auth method prompt for OpenRouter and prompt for token', async () => {
    mockSelect.mockResolvedValueOnce('openrouter'); // agent type
    mockPassword.mockResolvedValueOnce('or-test-key-123');

    const result = await agentConfigWizard();

    expect(result).toEqual({
      type: 'openrouter',
      authMethod: 'token',
      token: 'or-test-key-123',
    });
    // select called only once (agent type, no auth method prompt)
    expect(mockSelect).toHaveBeenCalledTimes(1);
    expect(mockPassword).toHaveBeenCalledTimes(1);
  });

  it('should skip auth method prompt for Together AI and prompt for token', async () => {
    mockSelect.mockResolvedValueOnce('together-ai'); // agent type
    mockPassword.mockResolvedValueOnce('tai-test-key-456');

    const result = await agentConfigWizard();

    expect(result).toEqual({
      type: 'together-ai',
      authMethod: 'token',
      token: 'tai-test-key-456',
    });
    expect(mockSelect).toHaveBeenCalledTimes(1);
    expect(mockPassword).toHaveBeenCalledTimes(1);
  });

  it('should show auth method prompt for claude-code (unchanged)', async () => {
    mockSelect.mockResolvedValueOnce('claude-code'); // agent type
    mockSelect.mockResolvedValueOnce('session'); // auth method

    await agentConfigWizard();

    expect(mockSelect).toHaveBeenCalledTimes(2);
    expect(mockPassword).not.toHaveBeenCalled();
  });

  it('should show auth method prompt for Ollama (no token required)', async () => {
    mockSelect.mockResolvedValueOnce('ollama'); // agent type
    mockSelect.mockResolvedValueOnce('session'); // auth method

    const result = await agentConfigWizard();

    expect(result).toEqual({
      type: 'ollama',
      authMethod: 'session',
    });
    expect(mockSelect).toHaveBeenCalledTimes(2);
    expect(mockPassword).not.toHaveBeenCalled();
  });
});
