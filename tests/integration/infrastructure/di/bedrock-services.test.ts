/**
 * Bedrock services DI smoke test.
 *
 * Verifies that the two bedrock-related output ports added in feature 098
 * (`IBedrockIntegrationService`, `IClaudeSettingsReconciler`) resolve from a
 * freshly-bootstrapped child container to their concrete adapters. Locks down
 * the registration and prevents silent regressions in registerServices.
 */

import 'reflect-metadata';
import { describe, it, expect, beforeAll } from 'vitest';
import { container as rootContainer, type DependencyContainer } from 'tsyringe';

import { registerServices } from '@/infrastructure/di/modules/register-services.js';
import {
  IBedrockIntegrationServiceToken,
  IClaudeSettingsReconcilerToken,
} from '@/infrastructure/di/tokens.js';
import { BedrockIntegrationService } from '@/infrastructure/services/integrations/bedrock-integration.service.js';
import { ClaudeSettingsReconciler } from '@/infrastructure/services/filesystem/claude-settings-reconciler.service.js';

describe('bedrock services DI registration', () => {
  let scoped: DependencyContainer;

  beforeAll(() => {
    scoped = rootContainer.createChildContainer();
    registerServices(scoped);
  });

  it('exports IBedrockIntegrationServiceToken matching the registered string token', () => {
    expect(IBedrockIntegrationServiceToken).toBe('IBedrockIntegrationService');
  });

  it('exports IClaudeSettingsReconcilerToken matching the registered string token', () => {
    expect(IClaudeSettingsReconcilerToken).toBe('IClaudeSettingsReconciler');
  });

  it('resolves IBedrockIntegrationService to a BedrockIntegrationService instance', () => {
    const instance = scoped.resolve(IBedrockIntegrationServiceToken);
    expect(instance).toBeInstanceOf(BedrockIntegrationService);
  });

  it('resolves IClaudeSettingsReconciler to a ClaudeSettingsReconciler instance', () => {
    const instance = scoped.resolve(IClaudeSettingsReconcilerToken);
    expect(instance).toBeInstanceOf(ClaudeSettingsReconciler);
  });

  it('returns the same singleton instance across multiple resolutions', () => {
    const a = scoped.resolve(IBedrockIntegrationServiceToken);
    const b = scoped.resolve(IBedrockIntegrationServiceToken);
    expect(a).toBe(b);
  });
});
