// @vitest-environment node

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockResetSettings = vi.fn();
const mockInitializeSettings = vi.fn();
const mockResolve = vi.fn();
const mockExecute = vi.fn();
const mockRevalidatePath = vi.fn();

vi.mock('@shepai/core/infrastructure/services/settings.service', () => ({
  resetSettings: mockResetSettings,
  initializeSettings: mockInitializeSettings,
}));

vi.mock('@/lib/server-container', () => ({
  resolve: mockResolve,
}));

vi.mock('next/cache', () => ({
  revalidatePath: mockRevalidatePath,
}));

const { updateDefaultEffort } = await import(
  '../../../../../src/presentation/web/app/actions/update-default-effort.js'
);

const updatedSettings = {
  id: 'settings-1',
  models: { default: 'claude-opus-5-5', effort: 'high' },
};

describe('updateDefaultEffort server action', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockResolve.mockReturnValue({ execute: mockExecute });
    mockExecute.mockResolvedValue(updatedSettings);
  });

  it('delegates to SetDefaultEffortUseCase with the chosen level', async () => {
    const result = await updateDefaultEffort('high');

    expect(mockResolve).toHaveBeenCalledWith('SetDefaultEffortUseCase');
    expect(mockExecute).toHaveBeenCalledWith({ effort: 'high' });
    expect(result).toEqual({ ok: true });
  });

  it('passes null through to clear the setting (agent default)', async () => {
    await updateDefaultEffort(null);

    expect(mockExecute).toHaveBeenCalledWith({ effort: null });
  });

  it('refreshes the in-memory settings singleton with the persisted settings', async () => {
    await updateDefaultEffort('high');

    expect(mockResetSettings).toHaveBeenCalledOnce();
    expect(mockInitializeSettings).toHaveBeenCalledWith(updatedSettings);
  });

  it('returns the use case error without refreshing settings', async () => {
    mockExecute.mockRejectedValue(new Error('Unknown effort "ultra"'));

    const result = await updateDefaultEffort('ultra');

    expect(result).toEqual({ ok: false, error: 'Unknown effort "ultra"' });
    expect(mockInitializeSettings).not.toHaveBeenCalled();
  });
});
