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
vi.mock('@/lib/server-container', () => ({ resolve: mockResolve }));
vi.mock('next/cache', () => ({ revalidatePath: mockRevalidatePath }));

const { setFeatureFlag } = await import(
  '../../../../../src/presentation/web/app/actions/set-feature-flag.js'
);

describe('setFeatureFlag server action (spec 133)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockResolve.mockReturnValue({ execute: mockExecute });
  });

  it('turns the flag through SetFeatureFlagUseCase and refreshes the singleton and layout', async () => {
    const updated = { id: 's', featureFlags: { spaces: false } };
    mockExecute.mockResolvedValue(updated);

    const result = await setFeatureFlag('spaces', false);

    expect(mockResolve).toHaveBeenCalledWith('SetFeatureFlagUseCase');
    expect(mockExecute).toHaveBeenCalledWith({ key: 'spaces', enabled: false });
    expect(mockInitializeSettings).toHaveBeenCalledWith(updated);
    expect(mockRevalidatePath).toHaveBeenCalledWith('/', 'layout');
    expect(result).toEqual({ ok: true });
  });

  it('returns the use case error without touching the singleton', async () => {
    mockExecute.mockRejectedValue(new Error('Unknown feature flag "nope"'));

    expect(await setFeatureFlag('nope', true)).toEqual({
      ok: false,
      error: 'Unknown feature flag "nope"',
    });
    expect(mockInitializeSettings).not.toHaveBeenCalled();
  });
});
