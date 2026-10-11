/**
 * Agent Command Unit Tests
 *
 * Tests for the `shep settings agent` command.
 *
 * TDD Phase: RED → GREEN
 */

import 'reflect-metadata';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Command } from 'commander';

// Mock the container - factory must not reference outer variables (hoisted)
vi.mock('@/infrastructure/di/container.js', () => ({
  container: {
    resolve: vi.fn(),
  },
}));

// Mock the wizard
vi.mock('../../../../../../src/presentation/tui/wizards/agent-config.wizard.js', () => ({
  agentConfigWizard: vi.fn(),
}));

// Mock the settings service
vi.mock('@/infrastructure/services/settings.service.js', () => ({
  initializeSettings: vi.fn(),
  resetSettings: vi.fn(),
}));

import { container } from '@/infrastructure/di/container.js';
import { agentConfigWizard } from '../../../../../../src/presentation/tui/wizards/agent-config.wizard.js';
import { initializeSettings, resetSettings } from '@/infrastructure/services/settings.service.js';
import { createAgentCommand } from '../../../../../../src/presentation/cli/commands/settings/agent.command.js';
import { AgentType, AgentAuthMethod } from '@/domain/generated/output.js';

describe('Agent Command', () => {
  const mockSettings = {
    id: 'test-id',
    models: {
      analyze: 'claude-sonnet-4-5',
      requirements: 'claude-sonnet-4-5',
      plan: 'claude-sonnet-4-5',
      implement: 'claude-sonnet-4-5',
    },
    user: {},
    environment: { defaultEditor: 'vscode', shellPreference: 'bash' },
    system: { logLevel: 'info' },
    agent: { type: AgentType.ClaudeCode, authMethod: AgentAuthMethod.Session },
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockConfigureUseCase = { execute: vi.fn() };

  beforeEach(() => {
    vi.clearAllMocks();
    process.exitCode = undefined;
    (container.resolve as ReturnType<typeof vi.fn>).mockReturnValue(mockConfigureUseCase);
    mockConfigureUseCase.execute.mockResolvedValue(mockSettings);
  });

  describe('command structure', () => {
    it('should create a valid Commander command', () => {
      const cmd = createAgentCommand();
      expect(cmd).toBeInstanceOf(Command);
      expect(cmd.name()).toBe('agent');
    });

    it('should have --agent option', () => {
      const cmd = createAgentCommand();
      const opt = cmd.options.find((o) => o.long === '--agent');
      expect(opt).toBeDefined();
    });

    it('should have --auth option', () => {
      const cmd = createAgentCommand();
      const opt = cmd.options.find((o) => o.long === '--auth');
      expect(opt).toBeDefined();
    });

    it('should have --token option', () => {
      const cmd = createAgentCommand();
      const opt = cmd.options.find((o) => o.long === '--token');
      expect(opt).toBeDefined();
    });
  });

  describe('interactive mode (wizard)', () => {
    it('should launch wizard when no flags provided', async () => {
      const wizardResult = {
        type: AgentType.ClaudeCode,
        authMethod: AgentAuthMethod.Session,
      };
      (agentConfigWizard as ReturnType<typeof vi.fn>).mockResolvedValue(wizardResult);

      const cmd = createAgentCommand();
      const logSpy = vi.spyOn(console, 'log').mockImplementation(vi.fn());
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(vi.fn());

      await cmd.parseAsync([], { from: 'user' });

      expect(agentConfigWizard).toHaveBeenCalled();
      expect(mockConfigureUseCase.execute).toHaveBeenCalledWith(wizardResult);
      logSpy.mockRestore();
      errorSpy.mockRestore();
    });

    it('should update settings singleton after wizard success', async () => {
      const wizardResult = {
        type: AgentType.ClaudeCode,
        authMethod: AgentAuthMethod.Token,
        token: 'sk-test-key',
      };
      (agentConfigWizard as ReturnType<typeof vi.fn>).mockResolvedValue(wizardResult);

      const cmd = createAgentCommand();
      const logSpy = vi.spyOn(console, 'log').mockImplementation(vi.fn());
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(vi.fn());

      await cmd.parseAsync([], { from: 'user' });

      expect(resetSettings).toHaveBeenCalled();
      expect(initializeSettings).toHaveBeenCalledWith(mockSettings);
      logSpy.mockRestore();
      errorSpy.mockRestore();
    });
  });

  describe('non-interactive mode (flags)', () => {
    it('should skip wizard when --agent and --auth flags provided', async () => {
      const cmd = createAgentCommand();
      const logSpy = vi.spyOn(console, 'log').mockImplementation(vi.fn());
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(vi.fn());

      await cmd.parseAsync(['--agent', 'claude-code', '--auth', 'session'], { from: 'user' });

      expect(agentConfigWizard).not.toHaveBeenCalled();
      expect(mockConfigureUseCase.execute).toHaveBeenCalledWith({
        type: 'claude-code',
        authMethod: 'session',
      });
      logSpy.mockRestore();
      errorSpy.mockRestore();
    });

    it('should include token when --token flag provided', async () => {
      const cmd = createAgentCommand();
      const logSpy = vi.spyOn(console, 'log').mockImplementation(vi.fn());
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(vi.fn());

      await cmd.parseAsync(
        ['--agent', 'claude-code', '--auth', 'token', '--token', 'sk-test-key'],
        { from: 'user' }
      );

      expect(mockConfigureUseCase.execute).toHaveBeenCalledWith({
        type: 'claude-code',
        authMethod: 'token',
        token: 'sk-test-key',
      });
      logSpy.mockRestore();
      errorSpy.mockRestore();
    });

    it('should require --auth when --agent is provided', async () => {
      const cmd = createAgentCommand();
      const logSpy = vi.spyOn(console, 'log').mockImplementation(vi.fn());
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(vi.fn());

      await cmd.parseAsync(['--agent', 'claude-code'], { from: 'user' });

      expect(process.exitCode).toBe(1);
      logSpy.mockRestore();
      errorSpy.mockRestore();
      process.exitCode = undefined;
    });
  });

  describe('error handling', () => {
    it('should handle use case errors gracefully', async () => {
      mockConfigureUseCase.execute.mockRejectedValue(
        new Error('Agent "claude-code" is not available')
      );

      const cmd = createAgentCommand();
      const logSpy = vi.spyOn(console, 'log').mockImplementation(vi.fn());
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(vi.fn());

      await cmd.parseAsync(['--agent', 'claude-code', '--auth', 'session'], { from: 'user' });

      expect(process.exitCode).toBe(1);
      logSpy.mockRestore();
      errorSpy.mockRestore();
      process.exitCode = undefined;
    });

    it('should handle wizard cancellation (user ctrl+c)', async () => {
      (agentConfigWizard as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('User force closed the prompt')
      );

      const cmd = createAgentCommand();
      const logSpy = vi.spyOn(console, 'log').mockImplementation(vi.fn());
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(vi.fn());

      await cmd.parseAsync([], { from: 'user' });

      // Ctrl+C should exit cleanly, not set error code
      expect(process.exitCode).toBeUndefined();
      logSpy.mockRestore();
      errorSpy.mockRestore();
    });
  });
});
