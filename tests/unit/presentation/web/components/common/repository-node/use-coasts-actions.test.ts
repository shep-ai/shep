import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

// Mock server actions
vi.mock('@/app/actions/generate-coastfile', () => ({
  generateCoastfileAction: vi.fn(),
}));
vi.mock('@/app/actions/check-coastfile', () => ({
  checkCoastfileAction: vi.fn(),
}));

import { generateCoastfileAction } from '@/app/actions/generate-coastfile';
import { checkCoastfileAction } from '@/app/actions/check-coastfile';
import { useCoastsActions } from '@cli/presentation/web/components/common/repository-node/use-coasts-actions.js';

describe('useCoastsActions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('checks coastfile existence on mount', async () => {
    vi.mocked(checkCoastfileAction).mockResolvedValue({ exists: true });

    const { result } = renderHook(() => useCoastsActions({ repositoryPath: '/repos/my-project' }));

    await vi.waitFor(() => {
      expect(result.current.coastfileExists).toBe(true);
    });

    expect(checkCoastfileAction).toHaveBeenCalledWith('/repos/my-project');
  });

  it('returns coastfileExists false when no Coastfile', async () => {
    vi.mocked(checkCoastfileAction).mockResolvedValue({ exists: false });

    const { result } = renderHook(() => useCoastsActions({ repositoryPath: '/repos/my-project' }));

    await vi.waitFor(() => {
      expect(result.current.checkLoading).toBe(false);
    });

    expect(result.current.coastfileExists).toBe(false);
  });

  it('calls generateCoastfileAction and updates state on success', async () => {
    vi.mocked(checkCoastfileAction).mockResolvedValue({ exists: false });
    vi.mocked(generateCoastfileAction).mockResolvedValue({
      success: true,
      coastfilePath: '/repos/my-project/Coastfile',
    });

    const { result } = renderHook(() => useCoastsActions({ repositoryPath: '/repos/my-project' }));

    await vi.waitFor(() => {
      expect(result.current.checkLoading).toBe(false);
    });

    await act(async () => {
      await result.current.generateCoastfile();
    });

    expect(generateCoastfileAction).toHaveBeenCalledWith('/repos/my-project');
    expect(result.current.coastfileExists).toBe(true);
    expect(result.current.error).toBeNull();
  });

  it('sets error on generateCoastfileAction failure', async () => {
    vi.mocked(checkCoastfileAction).mockResolvedValue({ exists: false });
    vi.mocked(generateCoastfileAction).mockResolvedValue({
      success: false,
      error: 'Agent failed',
    });

    const { result } = renderHook(() => useCoastsActions({ repositoryPath: '/repos/my-project' }));

    await vi.waitFor(() => {
      expect(result.current.checkLoading).toBe(false);
    });

    await act(async () => {
      await result.current.generateCoastfile();
    });

    expect(result.current.error).toBe('Agent failed');
    expect(result.current.coastfileExists).toBe(false);
  });

  it('returns no-op state when input is null', () => {
    const { result } = renderHook(() => useCoastsActions(null));

    expect(result.current.coastfileExists).toBe(false);
    expect(result.current.generating).toBe(false);
    expect(checkCoastfileAction).not.toHaveBeenCalled();
  });
});
