import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  checkForUpdates,
  type UpdateCheckerDeps,
} from '../../../packages/electron/src/update-checker.js';

function createMockDeps(overrides: Partial<UpdateCheckerDeps> = {}): UpdateCheckerDeps {
  return {
    currentVersion: '1.0.0',
    repoOwner: 'shepai',
    repoName: 'cli',
    fetch: vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        tag_name: 'v1.0.0',
        html_url: 'https://github.com/shepai/cli/releases/tag/v1.0.0',
      }),
    }),
    sendToRenderer: vi.fn(),
    warn: vi.fn(),
    ...overrides,
  };
}

describe('checkForUpdates', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('fetches GitHub API and detects newer version', async () => {
    const deps = createMockDeps({
      currentVersion: '1.0.0',
      fetch: vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({
          tag_name: 'v2.0.0',
          html_url: 'https://github.com/shepai/cli/releases/tag/v2.0.0',
        }),
      }),
    });

    checkForUpdates(deps);
    await vi.advanceTimersByTimeAsync(10_000);

    expect(deps.sendToRenderer).toHaveBeenCalledWith({
      version: '2.0.0',
      downloadUrl: 'https://github.com/shepai/cli/releases/tag/v2.0.0',
    });
  });

  it('sends no IPC when current version is latest', async () => {
    const deps = createMockDeps({
      currentVersion: '1.0.0',
      fetch: vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({
          tag_name: 'v1.0.0',
          html_url: 'https://github.com/shepai/cli/releases/tag/v1.0.0',
        }),
      }),
    });

    checkForUpdates(deps);
    await vi.advanceTimersByTimeAsync(10_000);

    expect(deps.sendToRenderer).not.toHaveBeenCalled();
  });

  it('sends no IPC when current version is newer', async () => {
    const deps = createMockDeps({
      currentVersion: '2.0.0',
      fetch: vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({
          tag_name: 'v1.5.0',
          html_url: 'https://github.com/shepai/cli/releases/tag/v1.5.0',
        }),
      }),
    });

    checkForUpdates(deps);
    await vi.advanceTimersByTimeAsync(10_000);

    expect(deps.sendToRenderer).not.toHaveBeenCalled();
  });

  it('catches network errors silently', async () => {
    const deps = createMockDeps({
      fetch: vi.fn().mockRejectedValue(new Error('Network error')),
    });

    checkForUpdates(deps);
    await vi.advanceTimersByTimeAsync(10_000);

    expect(deps.sendToRenderer).not.toHaveBeenCalled();
    expect(deps.warn).toHaveBeenCalledWith(
      expect.stringContaining('Update check failed'),
      expect.any(Error)
    );
  });

  it('handles non-OK HTTP response silently', async () => {
    const deps = createMockDeps({
      fetch: vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        json: vi.fn(),
      }),
    });

    checkForUpdates(deps);
    await vi.advanceTimersByTimeAsync(10_000);

    expect(deps.sendToRenderer).not.toHaveBeenCalled();
  });

  it('runs after 10-second delay', async () => {
    const deps = createMockDeps({
      currentVersion: '1.0.0',
      fetch: vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({
          tag_name: 'v2.0.0',
          html_url: 'https://github.com/shepai/cli/releases/latest',
        }),
      }),
    });

    checkForUpdates(deps);

    // Before 10s — no fetch yet
    await vi.advanceTimersByTimeAsync(5_000);
    expect(deps.fetch).not.toHaveBeenCalled();

    // At 10s — fetch runs
    await vi.advanceTimersByTimeAsync(5_000);
    expect(deps.fetch).toHaveBeenCalledOnce();
  });

  it('handles tag_name without v prefix', async () => {
    const deps = createMockDeps({
      currentVersion: '1.0.0',
      fetch: vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({
          tag_name: '2.0.0',
          html_url: 'https://github.com/shepai/cli/releases/tag/2.0.0',
        }),
      }),
    });

    checkForUpdates(deps);
    await vi.advanceTimersByTimeAsync(10_000);

    expect(deps.sendToRenderer).toHaveBeenCalledWith({
      version: '2.0.0',
      downloadUrl: 'https://github.com/shepai/cli/releases/tag/2.0.0',
    });
  });

  it('handles invalid tag_name gracefully', async () => {
    const deps = createMockDeps({
      fetch: vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({
          tag_name: 'not-a-version',
          html_url: 'https://github.com/shepai/cli/releases/latest',
        }),
      }),
    });

    checkForUpdates(deps);
    await vi.advanceTimersByTimeAsync(10_000);

    expect(deps.sendToRenderer).not.toHaveBeenCalled();
  });
});
