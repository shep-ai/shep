// @vitest-environment node

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createDefaultSettings } from '@shepai/core/domain/factories/settings-defaults.factory';

const mockLoadExecute = vi.fn();
const mockUpdateExecute = vi.fn();
const mockResolve = vi.fn();
const mockUpdateSettingsSingleton = vi.fn();
const mockRevalidatePath = vi.fn();

vi.mock('@/lib/server-container', () => ({
  resolve: (...args: unknown[]) => mockResolve(...args),
}));

vi.mock('@shepai/core/application/use-cases/settings/load-settings.use-case', () => ({
  LoadSettingsUseCase: class LoadSettingsUseCase {},
}));

vi.mock('@shepai/core/application/use-cases/settings/update-settings.use-case', () => ({
  UpdateSettingsUseCase: class UpdateSettingsUseCase {},
}));

vi.mock('@shepai/core/infrastructure/services/settings.service', () => ({
  updateSettings: (...args: unknown[]) => mockUpdateSettingsSingleton(...args),
}));

vi.mock('next/cache', () => ({
  revalidatePath: (...args: unknown[]) => mockRevalidatePath(...args),
}));

const { updateSettingsAction } = await import(
  '../../../../../src/presentation/web/app/actions/update-settings.js'
);

describe('updateSettingsAction server action', () => {
  const defaults = createDefaultSettings();

  beforeEach(() => {
    vi.clearAllMocks();
    mockResolve.mockImplementation((token: unknown) => {
      const name = typeof token === 'function' ? (token as { name: string }).name : String(token);
      if (name === 'LoadSettingsUseCase') {
        return { execute: mockLoadExecute };
      }
      if (name === 'UpdateSettingsUseCase') {
        return { execute: mockUpdateExecute };
      }
      return {};
    });
    mockLoadExecute.mockResolvedValue(defaults);
    mockUpdateExecute.mockImplementation(async (s: unknown) => s);
  });

  it('merges partial payload into current settings and persists', async () => {
    const result = await updateSettingsAction({
      agent: { type: 'gemini-cli' },
    } as any);

    expect(result.success).toBe(true);
    expect(result.error).toBeUndefined();

    // Verify the merged settings were persisted
    const persistedSettings = mockUpdateExecute.mock.calls[0][0];
    expect(persistedSettings.agent.type).toBe('gemini-cli');
    // Other agent fields should be preserved from defaults
    expect(persistedSettings.agent.authMethod).toBe(defaults.agent.authMethod);
  });

  it('updates the in-memory singleton after persistence', async () => {
    await updateSettingsAction({ system: { logLevel: 'debug' } });

    expect(mockUpdateSettingsSingleton).toHaveBeenCalledTimes(1);
    const singletonSettings = mockUpdateSettingsSingleton.mock.calls[0][0];
    expect(singletonSettings.system.logLevel).toBe('debug');
  });

  it('calls revalidatePath on root layout after success', async () => {
    await updateSettingsAction({ system: { autoUpdate: false } });

    expect(mockRevalidatePath).toHaveBeenCalledWith('/', 'layout');
  });

  it('returns error on failure', async () => {
    mockUpdateExecute.mockRejectedValue(new Error('DB write failed'));

    const result = await updateSettingsAction({ system: { logLevel: 'warn' } });

    expect(result.success).toBe(false);
    expect(result.error).toBe('DB write failed');
  });

  it('deep-merges nested objects without losing sibling keys', async () => {
    await updateSettingsAction({
      notifications: {
        inApp: { enabled: false },
      },
    });

    const persisted = mockUpdateExecute.mock.calls[0][0];
    // inApp.enabled updated
    expect(persisted.notifications.inApp.enabled).toBe(false);
    // browser and desktop preserved from defaults
    expect(persisted.notifications.browser.enabled).toBe(defaults.notifications.browser.enabled);
    expect(persisted.notifications.desktop.enabled).toBe(defaults.notifications.desktop.enabled);
  });

  it('handles featureFlags partial update', async () => {
    await updateSettingsAction({
      featureFlags: { debug: true },
    } as any);

    const persisted = mockUpdateExecute.mock.calls[0][0];
    expect(persisted.featureFlags.debug).toBe(true);
    expect(persisted.featureFlags.envDeploy).toBe(true);
  });
});
