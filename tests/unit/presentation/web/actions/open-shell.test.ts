// @vitest-environment node

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockGetSettings = vi.fn();
vi.mock('@shepai/core/infrastructure/services/settings.service', () => ({
  getSettings: mockGetSettings,
}));

const mockGetTerminalOpenConfig = vi.fn();
const mockResolve = vi.fn();
vi.mock('@/lib/server-container', () => ({
  resolve: (...args: unknown[]) => mockResolve(...args),
}));

const MOCK_WORKTREE_PATH = '/mock/.shep/repos/abc123/wt/feat-test';
vi.mock('@shepai/core/infrastructure/services/ide-launchers/compute-worktree-path', () => ({
  computeWorktreePath: () => MOCK_WORKTREE_PATH,
}));

const mockExistsSync = vi.fn<(path: string) => boolean>();
vi.mock('node:fs', () => ({
  existsSync: (path: string) => mockExistsSync(path),
}));

const mockUnref = vi.fn();
const mockOn = vi.fn();
const mockSpawn = vi.fn();
vi.mock('node:child_process', () => ({
  spawn: (...args: unknown[]) => mockSpawn(...args),
}));

const mockPlatform = vi.fn<() => string>();
vi.mock('node:os', () => ({
  platform: () => mockPlatform(),
}));

const mockIsAbsolute = vi.fn<(p: string) => boolean>();
vi.mock('node:path', async () => {
  const actual = await vi.importActual('node:path');
  return { ...actual, isAbsolute: (p: string) => mockIsAbsolute(p) };
});

// No longer mocking tool-metadata — open-shell should use DI container instead

const { openShell } = await import('../../../../../src/presentation/web/app/actions/open-shell.js');

describe('openShell server action', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSettings.mockReturnValue({
      environment: { shellPreference: 'zsh' },
    });
    mockExistsSync.mockReturnValue(true);
    mockSpawn.mockReturnValue({ unref: mockUnref, on: mockOn });
    mockPlatform.mockReturnValue('darwin');
    mockIsAbsolute.mockImplementation((p: string) => /^\//.test(p));
    mockGetTerminalOpenConfig.mockReturnValue(null);
    mockResolve.mockReturnValue({ getTerminalOpenConfig: mockGetTerminalOpenConfig });
  });

  it('returns error for empty repositoryPath', async () => {
    const result = await openShell({ repositoryPath: '', branch: 'main' });

    expect(result).toEqual({
      success: false,
      error: 'repositoryPath must be an absolute path',
    });
  });

  it('returns error for relative repositoryPath', async () => {
    const result = await openShell({ repositoryPath: 'relative/path', branch: 'main' });

    expect(result).toEqual({
      success: false,
      error: 'repositoryPath must be an absolute path',
    });
  });

  it('accepts Windows-style absolute paths when path.isAbsolute recognizes them', async () => {
    mockPlatform.mockReturnValue('darwin');
    mockIsAbsolute.mockReturnValue(true);

    const result = await openShell({ repositoryPath: 'C:\\Users\\test\\project' });

    expect(result.success).toBe(true);
  });

  it('returns error when worktree path does not exist', async () => {
    mockExistsSync.mockReturnValue(false);

    const result = await openShell({ repositoryPath: '/home/user/project', branch: 'main' });

    expect(result.success).toBe(false);
    expect(result.error).toContain('does not exist');
  });

  it('spawns correct command on win32', async () => {
    mockPlatform.mockReturnValue('win32');

    const result = await openShell({ repositoryPath: '/home/user/project', branch: 'feat/test' });

    expect(result.success).toBe(true);
    expect(mockSpawn).toHaveBeenCalledWith(
      'cmd.exe',
      ['/c', 'start', 'powershell', '-NoExit', '-Command', `Set-Location "${MOCK_WORKTREE_PATH}"`],
      { detached: true, stdio: 'ignore' }
    );
    expect(mockUnref).toHaveBeenCalled();
  });

  it('returns error on unsupported platform', async () => {
    mockPlatform.mockReturnValue('freebsd');

    const result = await openShell({ repositoryPath: '/home/user/project', branch: 'main' });

    expect(result.success).toBe(false);
    expect(result.error).toContain('freebsd');
  });

  it('spawns correct command on darwin', async () => {
    mockPlatform.mockReturnValue('darwin');

    const result = await openShell({ repositoryPath: '/home/user/project', branch: 'feat/test' });

    expect(result.success).toBe(true);
    // Issue #583: use osascript with `do script "cd ..."` to reliably cd
    // into the target — `open -a Terminal /path` was unreliable when
    // Terminal was already running and would land at $HOME.
    expect(mockSpawn).toHaveBeenCalledWith(
      'osascript',
      [
        '-e',
        `tell application "Terminal" to do script "cd '${MOCK_WORKTREE_PATH}'; clear"`,
        '-e',
        'tell application "Terminal" to activate',
      ],
      {
        detached: true,
        stdio: 'ignore',
      }
    );
    expect(mockUnref).toHaveBeenCalled();
  });

  it('escapes single quotes in path on darwin to prevent shell injection', async () => {
    mockPlatform.mockReturnValue('darwin');
    const trickyPath = "/Users/me/it's/repo";

    const result = await openShell({ repositoryPath: trickyPath });

    expect(result.success).toBe(true);
    expect(mockSpawn).toHaveBeenCalledWith(
      'osascript',
      [
        '-e',
        // The single quote inside the path must be escaped for the
        // outer single-quoted shell string so `cd` receives the right path.
        `tell application "Terminal" to do script "cd '/Users/me/it'\\''s/repo'; clear"`,
        '-e',
        'tell application "Terminal" to activate',
      ],
      {
        detached: true,
        stdio: 'ignore',
      }
    );
  });

  it('spawns correct command on linux', async () => {
    mockPlatform.mockReturnValue('linux');

    const result = await openShell({ repositoryPath: '/home/user/project', branch: 'feat/test' });

    expect(result.success).toBe(true);
    expect(mockSpawn).toHaveBeenCalledWith(
      'x-terminal-emulator',
      [`--working-directory=${MOCK_WORKTREE_PATH}`],
      { detached: true, stdio: 'ignore' }
    );
    expect(mockUnref).toHaveBeenCalled();
  });

  it('returns success with correct payload', async () => {
    mockPlatform.mockReturnValue('darwin');
    mockGetSettings.mockReturnValue({
      environment: { shellPreference: 'fish' },
    });

    const result = await openShell({ repositoryPath: '/home/user/project', branch: 'feat/test' });

    expect(result).toEqual({
      success: true,
      path: MOCK_WORKTREE_PATH,
      shell: 'fish',
    });
  });

  it('registers error handler on spawned child', async () => {
    mockPlatform.mockReturnValue('darwin');

    await openShell({ repositoryPath: '/home/user/project', branch: 'main' });

    expect(mockOn).toHaveBeenCalledWith('error', expect.any(Function));
  });

  it('returns error when spawn throws', async () => {
    mockPlatform.mockReturnValue('darwin');
    mockSpawn.mockImplementation(() => {
      throw new Error('spawn failed');
    });

    const result = await openShell({ repositoryPath: '/home/user/project', branch: 'main' });

    expect(result).toEqual({ success: false, error: 'spawn failed' });
  });

  it('returns generic error for non-Error throws', async () => {
    mockPlatform.mockReturnValue('darwin');
    mockSpawn.mockImplementation(() => {
      throw 'unexpected';
    });

    const result = await openShell({ repositoryPath: '/home/user/project', branch: 'main' });

    expect(result).toEqual({ success: false, error: 'Failed to open shell' });
  });

  it('uses repositoryPath directly when branch is not provided', async () => {
    mockPlatform.mockReturnValue('darwin');

    const result = await openShell({ repositoryPath: '/home/user/project' });

    expect(result.success).toBe(true);
    expect(mockSpawn).toHaveBeenCalledWith(
      'osascript',
      [
        '-e',
        `tell application "Terminal" to do script "cd '/home/user/project'; clear"`,
        '-e',
        'tell application "Terminal" to activate',
      ],
      {
        detached: true,
        stdio: 'ignore',
      }
    );
    expect(result.path).toBe('/home/user/project');
  });

  it('uses DI container to resolve terminal config for non-system terminal', async () => {
    mockPlatform.mockReturnValue('darwin');
    mockGetSettings.mockReturnValue({
      environment: { shellPreference: 'zsh', terminalPreference: 'warp' },
    });
    mockGetTerminalOpenConfig.mockReturnValue({
      openDirectory: 'open -a Warp {dir}',
      shell: false,
    });

    const result = await openShell({ repositoryPath: '/home/user/project' });

    expect(result.success).toBe(true);
    expect(mockResolve).toHaveBeenCalledWith('IToolInstallerService');
    expect(mockGetTerminalOpenConfig).toHaveBeenCalledWith('warp');
    expect(mockSpawn).toHaveBeenCalledWith('open', ['-a', 'Warp', '/home/user/project'], {
      detached: true,
      stdio: 'ignore',
    });
  });

  it('uses DI container with shell: true for terminals requiring shell spawn', async () => {
    mockPlatform.mockReturnValue('darwin');
    mockGetSettings.mockReturnValue({
      environment: { shellPreference: 'zsh', terminalPreference: 'tmux' },
    });
    mockGetTerminalOpenConfig.mockReturnValue({
      openDirectory: 'tmux new-session -c {dir}',
      shell: true,
    });

    const result = await openShell({ repositoryPath: '/home/user/project' });

    expect(result.success).toBe(true);
    // Issue #583: when running through a shell, the path is single-quoted
    // so paths with spaces or shell metacharacters survive shell parsing.
    expect(mockSpawn).toHaveBeenCalledWith(`tmux new-session -c '/home/user/project'`, [], {
      detached: true,
      stdio: 'ignore',
      shell: true,
    });
  });

  it('preserves paths with spaces when launching a non-shell terminal', async () => {
    mockPlatform.mockReturnValue('darwin');
    mockGetSettings.mockReturnValue({
      environment: { shellPreference: 'zsh', terminalPreference: 'warp' },
    });
    mockGetTerminalOpenConfig.mockReturnValue({
      openDirectory: 'open -a Warp {dir}',
      shell: false,
    });

    const result = await openShell({ repositoryPath: '/Users/me/My Code/repo' });

    expect(result.success).toBe(true);
    // Path with spaces must remain a SINGLE arg — issue #583.
    expect(mockSpawn).toHaveBeenCalledWith('open', ['-a', 'Warp', '/Users/me/My Code/repo'], {
      detached: true,
      stdio: 'ignore',
    });
  });

  it('falls back to system terminal when DI resolve fails', async () => {
    mockPlatform.mockReturnValue('darwin');
    mockGetSettings.mockReturnValue({
      environment: { shellPreference: 'zsh', terminalPreference: 'warp' },
    });
    mockResolve.mockImplementation(() => {
      throw new Error('DI not available');
    });

    const result = await openShell({ repositoryPath: '/home/user/project' });

    expect(result.success).toBe(true);
    // Should fall back to system terminal (osascript on darwin)
    expect(mockSpawn).toHaveBeenCalledWith(
      'osascript',
      [
        '-e',
        `tell application "Terminal" to do script "cd '/home/user/project'; clear"`,
        '-e',
        'tell application "Terminal" to activate',
      ],
      {
        detached: true,
        stdio: 'ignore',
      }
    );
  });

  it('returns error when repositoryPath does not exist and no branch provided', async () => {
    mockPlatform.mockReturnValue('darwin');
    mockExistsSync.mockReturnValue(false);

    const result = await openShell({ repositoryPath: '/nonexistent' });

    expect(result.success).toBe(false);
    expect(result.error).toContain('does not exist');
  });
});
