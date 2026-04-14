/**
 * AgentValidatorService Unit Tests
 *
 * Tests for the agent binary availability checking service.
 * Uses constructor-injected exec function mock (NOT vi.mock of child_process).
 *
 * TDD Phase: RED-GREEN
 */

import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AgentValidatorService } from '@/infrastructure/services/agents/common/agent-validator.service.js';
import type { ExecFunction } from '@/infrastructure/services/agents/common/types.js';
import { AgentType } from '@/domain/generated/output.js';

describe('AgentValidatorService', () => {
  let mockExec: ExecFunction;
  let service: AgentValidatorService;

  beforeEach(() => {
    mockExec = vi.fn();
    service = new AgentValidatorService(mockExec);
  });

  describe('isAvailable - claude-code', () => {
    it('should return available with version when binary is found', async () => {
      // Arrange
      vi.mocked(mockExec).mockResolvedValue({
        stdout: '1.0.16\n',
        stderr: '',
      });

      // Act
      const result = await service.isAvailable(AgentType.ClaudeCode);

      // Assert
      expect(result.available).toBe(true);
      expect(result.version).toBe('1.0.16');
      expect(result.error).toBeUndefined();
      expect(mockExec).toHaveBeenCalledWith('claude', ['--version']);
    });

    it('should return not available when binary is not found', async () => {
      // Arrange
      vi.mocked(mockExec).mockRejectedValue(new Error('spawn claude ENOENT'));

      // Act
      const result = await service.isAvailable(AgentType.ClaudeCode);

      // Assert
      expect(result.available).toBe(false);
      expect(result.version).toBeUndefined();
      expect(result.error).toContain('claude');
      expect(result.error).toContain('not found or not executable');
    });

    it('should handle non-Error thrown values gracefully', async () => {
      // Arrange
      vi.mocked(mockExec).mockRejectedValue('unexpected string error');

      // Act
      const result = await service.isAvailable(AgentType.ClaudeCode);

      // Assert
      expect(result.available).toBe(false);
      expect(result.error).toContain('Unknown error');
    });

    it('should trim whitespace from version output', async () => {
      // Arrange
      vi.mocked(mockExec).mockResolvedValue({
        stdout: '  2.3.4  \n',
        stderr: '',
      });

      // Act
      const result = await service.isAvailable(AgentType.ClaudeCode);

      // Assert
      expect(result.version).toBe('2.3.4');
    });
  });

  describe('isAvailable - gemini-cli', () => {
    it('should return available with version when binary is found', async () => {
      vi.mocked(mockExec).mockResolvedValue({
        stdout: '0.29.2\n',
        stderr: '',
      });

      const result = await service.isAvailable(AgentType.GeminiCli);

      expect(result.available).toBe(true);
      expect(result.version).toBe('0.29.2');
      expect(mockExec).toHaveBeenCalledWith('gemini', ['--version']);
    });

    it('should return not available when binary is not found', async () => {
      vi.mocked(mockExec).mockRejectedValue(new Error('spawn gemini ENOENT'));

      const result = await service.isAvailable(AgentType.GeminiCli);

      expect(result.available).toBe(false);
      expect(result.error).toContain('gemini');
      expect(result.error).toContain('not found or not executable');
    });
  });

  describe('isAvailable - dev type', () => {
    it('should return available: true with version "dev" without calling execFn', async () => {
      const result = await service.isAvailable(AgentType.Dev);

      expect(result.available).toBe(true);
      expect(result.version).toBe('dev');
      expect(result.error).toBeUndefined();
      expect(mockExec).not.toHaveBeenCalled();
    });
  });

  describe('isAvailable - unsupported agents', () => {
    it('should return not available for aider', async () => {
      // Act
      const result = await service.isAvailable(AgentType.Aider);

      // Assert
      expect(result.available).toBe(false);
      expect(result.error).toContain('not supported yet');
      expect(mockExec).not.toHaveBeenCalled();
    });

    it('should return not available for continue', async () => {
      // Act
      const result = await service.isAvailable(AgentType.Continue);

      // Assert
      expect(result.available).toBe(false);
      expect(result.error).toContain('not supported yet');
    });
  });

  describe('isAvailable - codex-cli', () => {
    it('should return available with version when binary is found', async () => {
      vi.mocked(mockExec).mockResolvedValue({
        stdout: '0.1.0\n',
        stderr: '',
      });

      const result = await service.isAvailable(AgentType.CodexCli);

      expect(result.available).toBe(true);
      expect(result.version).toBe('0.1.0');
      expect(mockExec).toHaveBeenCalledWith('codex', ['--version']);
    });

    it('should return not available when binary is not found', async () => {
      vi.mocked(mockExec).mockRejectedValue(new Error('spawn codex ENOENT'));

      const result = await service.isAvailable(AgentType.CodexCli);

      expect(result.available).toBe(false);
      expect(result.error).toContain('codex');
      expect(result.error).toContain('not found or not executable');
    });
  });

  describe('isAvailable - copilot-cli', () => {
    it('should return available with version when binary is found', async () => {
      vi.mocked(mockExec).mockResolvedValue({
        stdout: '1.2.3\n',
        stderr: '',
      });

      const result = await service.isAvailable(AgentType.CopilotCli);

      expect(result.available).toBe(true);
      expect(result.version).toBe('1.2.3');
      expect(mockExec).toHaveBeenCalledWith('copilot', ['--version']);
    });

    it('should return not available when binary is not found', async () => {
      vi.mocked(mockExec).mockRejectedValue(new Error('spawn copilot ENOENT'));

      const result = await service.isAvailable(AgentType.CopilotCli);

      expect(result.available).toBe(false);
      expect(result.error).toContain('copilot');
      expect(result.error).toContain('not found or not executable');
    });
  });

  describe('isAvailable - cursor', () => {
    it('should return available with version when binary is found', async () => {
      // Arrange
      vi.mocked(mockExec).mockResolvedValue({
        stdout: '0.48.0\n',
        stderr: '',
      });

      // Act
      const result = await service.isAvailable(AgentType.Cursor);

      // Assert
      expect(result.available).toBe(true);
      expect(result.version).toBe('0.48.0');
      expect(mockExec).toHaveBeenCalledWith('cursor-agent', ['--version']);
    });
  });

  describe('isAvailable - SDK agents (no binary required)', () => {
    it('should return available with version "sdk" for openrouter without calling execFn', async () => {
      const result = await service.isAvailable(AgentType.OpenRouter);

      expect(result.available).toBe(true);
      expect(result.version).toBe('sdk');
      expect(result.error).toBeUndefined();
      expect(mockExec).not.toHaveBeenCalled();
    });

    it('should return available with version "sdk" for together-ai without calling execFn', async () => {
      const result = await service.isAvailable(AgentType.TogetherAi);

      expect(result.available).toBe(true);
      expect(result.version).toBe('sdk');
      expect(result.error).toBeUndefined();
      expect(mockExec).not.toHaveBeenCalled();
    });

    it('should return available with version "sdk" for ollama without calling execFn', async () => {
      const result = await service.isAvailable(AgentType.Ollama);

      expect(result.available).toBe(true);
      expect(result.version).toBe('sdk');
      expect(result.error).toBeUndefined();
      expect(mockExec).not.toHaveBeenCalled();
    });
  });
});
