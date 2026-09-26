// @vitest-environment node

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockGetSettings = vi.fn();
const mockResetSettings = vi.fn();
const mockInitializeSettings = vi.fn();
const mockResolve = vi.fn();
const mockExecute = vi.fn();

vi.mock('@shepai/core/infrastructure/services/settings.service', () => ({
  getSettings: mockGetSettings,
  resetSettings: mockResetSettings,
  initializeSettings: mockInitializeSettings,
}));

vi.mock('@/lib/server-container', () => ({
  resolve: mockResolve,
}));

const { updateModel } = await import(
  '../../../../../src/presentation/web/app/actions/update-model.js'
);

const baseSettings = {
  id: 'settings-1',
  models: { default: 'claude-sonnet-4-6' },
  agent: { type: 'claude-code' },
};

describe('updateModel server action', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSettings.mockReturnValue(baseSettings);
    mockResolve.mockReturnValue({ execute: mockExecute });
    mockExecute.mockResolvedValue(undefined);
  });

  it('persists the new model via UpdateSettingsUseCase', async () => {
    const result = await updateModel('claude-opus-4-6');

    expect(mockExecute).toHaveBeenCalledWith({
      ...baseSettings,
      models: { default: 'claude-opus-4-6' },
    });
    expect(result).toEqual({ ok: true });
  });

  it('keeps the other model settings (adaptive, effort) when changing the default', async () => {
    mockGetSettings.mockReturnValue({
      ...baseSettings,
      models: {
        default: 'claude-sonnet-4-6',
        effort: 'high',
        adaptive: { enabled: true, low: 'claude-haiku-4-5' },
      },
    });

    await updateModel('claude-opus-5-5');

    expect(mockExecute).toHaveBeenCalledWith(
      expect.objectContaining({
        models: {
          default: 'claude-opus-5-5',
          effort: 'high',
          adaptive: { enabled: true, low: 'claude-haiku-4-5' },
        },
      })
    );
  });

  it('refreshes the in-memory settings singleton after persisting', async () => {
    await updateModel('claude-haiku-4-5');

    expect(mockResetSettings).toHaveBeenCalled();
    expect(mockInitializeSettings).toHaveBeenCalledWith({
      ...baseSettings,
      models: { default: 'claude-haiku-4-5' },
    });
  });

  it('resolves UpdateSettingsUseCase from the DI container', async () => {
    await updateModel('claude-opus-4-6');

    expect(mockResolve).toHaveBeenCalledWith('UpdateSettingsUseCase');
  });

  it('returns error when model is empty string', async () => {
    const result = await updateModel('');

    expect(mockExecute).not.toHaveBeenCalled();
    expect(result).toEqual({ ok: false, error: 'model is required' });
  });

  it('returns error when model is whitespace only', async () => {
    const result = await updateModel('   ');

    expect(mockExecute).not.toHaveBeenCalled();
    expect(result).toEqual({ ok: false, error: 'model is required' });
  });

  it('returns error when use case throws', async () => {
    mockExecute.mockRejectedValue(new Error('DB write failed'));

    const result = await updateModel('claude-opus-4-6');

    expect(result).toEqual({ ok: false, error: 'DB write failed' });
  });

  it('returns fallback error message when non-Error is thrown', async () => {
    mockExecute.mockRejectedValue('unexpected');

    const result = await updateModel('claude-opus-4-6');

    expect(result).toEqual({ ok: false, error: 'Failed to update model' });
  });

  it('trims whitespace from the model value before persisting', async () => {
    await updateModel('  claude-opus-4-6  ');

    expect(mockExecute).toHaveBeenCalledWith(
      expect.objectContaining({ models: { default: 'claude-opus-4-6' } })
    );
  });
});
