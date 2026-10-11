/**
 * Model Settings Command Unit Tests
 *
 * Tests for the `shep settings model` command.
 *
 * TDD Phase: RED → GREEN
 */

import 'reflect-metadata';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Command } from 'commander';
import { AgentType, AgentAuthMethod } from '@/domain/generated/output.js';

// Hoisted mocks
const { mockContainerResolve, mockSelect, mockMessages } = vi.hoisted(() => ({
  mockContainerResolve: vi.fn(),
  mockSelect: vi.fn(),
  mockMessages: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
    newline: vi.fn(),
  },
}));

vi.mock('@/infrastructure/di/container.js', () => ({
  container: { resolve: (...args: unknown[]) => mockContainerResolve(...args) },
}));

vi.mock('@inquirer/prompts', () => ({
  select: (...args: unknown[]) => mockSelect(...args),
}));

vi.mock('../../../../../../src/presentation/cli/ui/index.js', () => ({
  messages: mockMessages,
}));

vi.mock('@/infrastructure/services/settings.service.js', () => ({
  getSettings: vi.fn().mockReturnValue({
    id: 'settings-id',
    models: { default: 'claude-sonnet-4-6' },
    agent: { type: AgentType.ClaudeCode, authMethod: AgentAuthMethod.Session },
    user: {},
    environment: { defaultEditor: 'vscode', shellPreference: 'bash' },
    system: { logLevel: 'info' },
    workflow: {
      openPrOnImplementationComplete: false,
      approvalGateDefaults: {
        allowPrd: false,
        allowPlan: false,
        allowMerge: false,
        pushOnImplementationComplete: false,
      },
    },
    createdAt: new Date(),
    updatedAt: new Date(),
  }),
  resetSettings: vi.fn(),
  initializeSettings: vi.fn(),
}));

import { createModelCommand } from '../../../../../../src/presentation/cli/commands/settings/model.command.js';

function makeFactory(models: string[]) {
  return {
    getSupportedModels: vi.fn().mockReturnValue(models),
    getSupportedAgents: vi.fn(),
    getCliInfo: vi.fn(),
    createExecutor: vi.fn(),
  };
}

function makeUpdateUseCase() {
  return {
    execute: vi.fn().mockImplementation((settings: unknown) => Promise.resolve(settings)),
  };
}

describe('createModelCommand', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.exitCode = undefined;
  });

  describe('command structure', () => {
    it('returns a Commander Command instance', () => {
      mockContainerResolve.mockReturnValue(makeFactory([]));
      const cmd = createModelCommand();
      expect(cmd).toBeInstanceOf(Command);
    });

    it('has name "model"', () => {
      mockContainerResolve.mockReturnValue(makeFactory([]));
      const cmd = createModelCommand();
      expect(cmd.name()).toBe('model');
    });

    it('has a description', () => {
      mockContainerResolve.mockReturnValue(makeFactory([]));
      const cmd = createModelCommand();
      expect(cmd.description()).toBeTruthy();
    });
  });

  describe('when agent has no supported models', () => {
    it('prints informational message and does not show a prompt', async () => {
      const factory = makeFactory([]);
      mockContainerResolve.mockImplementation((token: unknown) => {
        const key = typeof token === 'string' ? token : (token as { name?: string })?.name;
        if (key === 'IAgentExecutorFactory') return factory;
        return makeUpdateUseCase();
      });

      const cmd = createModelCommand();
      await cmd.parseAsync([], { from: 'user' });

      expect(mockSelect).not.toHaveBeenCalled();
      expect(mockMessages.info).toHaveBeenCalledWith(
        expect.stringContaining('No models available')
      );
    });
  });

  describe('when agent has supported models', () => {
    const models = ['claude-opus-4-6', 'claude-sonnet-4-6', 'claude-haiku-4-5'];

    it('presents select prompt with the advertised models', async () => {
      const factory = makeFactory(models);
      const updateUseCase = makeUpdateUseCase();
      mockContainerResolve.mockImplementation((token: unknown) => {
        const key = typeof token === 'string' ? token : (token as { name?: string })?.name;
        if (key === 'IAgentExecutorFactory') return factory;
        return updateUseCase;
      });
      mockSelect.mockResolvedValue('claude-sonnet-4-6');

      const cmd = createModelCommand();
      await cmd.parseAsync([], { from: 'user' });

      expect(mockSelect).toHaveBeenCalledWith(
        expect.objectContaining({
          choices: expect.arrayContaining([
            expect.objectContaining({ value: 'claude-opus-4-6' }),
            expect.objectContaining({ value: 'claude-sonnet-4-6' }),
            expect.objectContaining({ value: 'claude-haiku-4-5' }),
          ]),
        })
      );
    });

    it('pre-selects the current model in the prompt', async () => {
      const factory = makeFactory(models);
      const updateUseCase = makeUpdateUseCase();
      mockContainerResolve.mockImplementation((token: unknown) => {
        const key = typeof token === 'string' ? token : (token as { name?: string })?.name;
        if (key === 'IAgentExecutorFactory') return factory;
        return updateUseCase;
      });
      mockSelect.mockResolvedValue('claude-sonnet-4-6');

      const cmd = createModelCommand();
      await cmd.parseAsync([], { from: 'user' });

      expect(mockSelect).toHaveBeenCalledWith(
        expect.objectContaining({ default: 'claude-sonnet-4-6' })
      );
    });

    it('persists selected model to settings.models.default via UpdateSettingsUseCase', async () => {
      const factory = makeFactory(models);
      const updateUseCase = makeUpdateUseCase();
      mockContainerResolve.mockImplementation((token: unknown) => {
        const key = typeof token === 'string' ? token : (token as { name?: string })?.name;
        if (key === 'IAgentExecutorFactory') return factory;
        return updateUseCase;
      });
      mockSelect.mockResolvedValue('claude-opus-4-6');

      const cmd = createModelCommand();
      await cmd.parseAsync([], { from: 'user' });

      expect(updateUseCase.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          models: expect.objectContaining({ default: 'claude-opus-4-6' }),
        })
      );
    });

    it('prints confirmation message after saving', async () => {
      const factory = makeFactory(models);
      const updateUseCase = makeUpdateUseCase();
      mockContainerResolve.mockImplementation((token: unknown) => {
        const key = typeof token === 'string' ? token : (token as { name?: string })?.name;
        if (key === 'IAgentExecutorFactory') return factory;
        return updateUseCase;
      });
      mockSelect.mockResolvedValue('claude-opus-4-6');

      const cmd = createModelCommand();
      await cmd.parseAsync([], { from: 'user' });

      expect(mockMessages.success).toHaveBeenCalledWith(expect.stringContaining('claude-opus-4-6'));
    });
  });

  describe('error handling', () => {
    it('sets exit code 1 on use case error', async () => {
      const factory = makeFactory(['claude-sonnet-4-6']);
      const updateUseCase = { execute: vi.fn().mockRejectedValue(new Error('DB error')) };
      mockContainerResolve.mockImplementation((token: unknown) => {
        const key = typeof token === 'string' ? token : (token as { name?: string })?.name;
        if (key === 'IAgentExecutorFactory') return factory;
        return updateUseCase;
      });
      mockSelect.mockResolvedValue('claude-sonnet-4-6');

      const cmd = createModelCommand();
      await cmd.parseAsync([], { from: 'user' });

      expect(process.exitCode).toBe(1);
    });

    it('handles user cancellation (Ctrl+C) gracefully', async () => {
      const factory = makeFactory(['claude-sonnet-4-6']);
      mockContainerResolve.mockImplementation((token: unknown) => {
        const key = typeof token === 'string' ? token : (token as { name?: string })?.name;
        if (key === 'IAgentExecutorFactory') return factory;
        return makeUpdateUseCase();
      });
      mockSelect.mockRejectedValue(new Error('User force closed the prompt'));

      const cmd = createModelCommand();
      await cmd.parseAsync([], { from: 'user' });

      expect(process.exitCode).toBeUndefined();
      expect(mockMessages.info).toHaveBeenCalledWith(expect.stringContaining('cancelled'));
    });
  });
});
