/**
 * InitializeSettingsUseCase Unit Tests
 *
 * Tests for the InitializeSettingsUseCase that handles first-time settings creation.
 *
 * TDD Phase: RED
 * - These tests are written BEFORE implementation
 * - All tests should FAIL initially (use case doesn't exist yet)
 */

import 'reflect-metadata';
import { describe, it, expect, beforeEach } from 'vitest';
import { InitializeSettingsUseCase } from '@/application/use-cases/settings/initialize-settings.use-case.js';
import { MockSettingsRepository } from '../../../helpers/mock-repository.helper.js';
import { createDefaultSettings } from '@/domain/factories/settings-defaults.factory.js';

describe('InitializeSettingsUseCase', () => {
  let useCase: InitializeSettingsUseCase;
  let mockRepository: MockSettingsRepository;

  beforeEach(() => {
    mockRepository = new MockSettingsRepository();
    useCase = new InitializeSettingsUseCase(mockRepository as any);
  });

  describe('when settings do not exist', () => {
    it('should create new settings with defaults', async () => {
      // Arrange
      mockRepository.setSettings(null);

      // Act
      const result = await useCase.execute();

      // Assert
      expect(result).toBeDefined();
      expect(result.models.default).toBe('claude-sonnet-5');
      expect(result.environment.defaultEditor).toBe('vscode');
      expect(result.system.autoUpdate).toBe(true);
    });

    it('should call repository.initialize() with new settings', async () => {
      // Arrange
      mockRepository.setSettings(null);

      // Act
      await useCase.execute();

      // Assert
      expect(mockRepository.wasInitializeCalled()).toBe(true);
    });

    it('should call repository.load() first to check existence', async () => {
      // Arrange
      mockRepository.setSettings(null);

      // Act
      await useCase.execute();

      // Assert
      expect(mockRepository.wasLoadCalled()).toBe(true);
    });

    it('should generate unique IDs for new settings', async () => {
      // Arrange
      mockRepository.setSettings(null);

      // Act
      const result1 = await useCase.execute();
      mockRepository.reset();
      mockRepository.setSettings(null);
      const result2 = await useCase.execute();

      // Assert
      expect(result1.id).not.toBe(result2.id);
    });
  });

  describe('when settings already exist', () => {
    it('should return existing settings without creating new ones', async () => {
      // Arrange
      const existingSettings = createDefaultSettings();
      mockRepository.setSettings(existingSettings);

      // Act
      const result = await useCase.execute();

      // Assert
      expect(result).toBe(existingSettings);
      expect(result.id).toBe(existingSettings.id);
    });

    it('should not call repository.initialize() when settings exist', async () => {
      // Arrange
      const existingSettings = createDefaultSettings();
      mockRepository.setSettings(existingSettings);

      // Act
      await useCase.execute();

      // Assert
      expect(mockRepository.wasInitializeCalled()).toBe(false);
    });

    it('should call repository.load() to retrieve existing settings', async () => {
      // Arrange
      const existingSettings = createDefaultSettings();
      mockRepository.setSettings(existingSettings);

      // Act
      await useCase.execute();

      // Assert
      expect(mockRepository.wasLoadCalled()).toBe(true);
    });
  });

  describe('edge cases', () => {
    it('should handle rapid consecutive calls correctly', async () => {
      // Arrange
      mockRepository.setSettings(null);

      // Act
      const result1 = await useCase.execute();
      mockRepository.setSettings(result1);
      const result2 = await useCase.execute();

      // Assert
      expect(result2.id).toBe(result1.id);
    });
  });
});
