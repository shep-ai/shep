import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  resolvePort,
  type PortConflictDeps,
  type PortResolution,
} from '../../../packages/electron/src/port-conflict.js';

function createMockDeps(overrides: Partial<PortConflictDeps> = {}): PortConflictDeps {
  return {
    defaultPort: 4050,
    isPortAvailable: vi.fn().mockResolvedValue(true),
    findAvailablePort: vi.fn().mockResolvedValue(4051),
    showDialog: vi.fn().mockResolvedValue(0),
    warn: vi.fn(),
    ...overrides,
  };
}

describe('resolvePort', () => {
  let deps: PortConflictDeps;

  beforeEach(() => {
    deps = createMockDeps();
  });

  it('returns default port when it is available', async () => {
    const result = await resolvePort(deps);

    expect(result).toEqual<PortResolution>({
      port: 4050,
      startServer: true,
    });
    expect(deps.showDialog).not.toHaveBeenCalled();
  });

  it('shows dialog when port is in use', async () => {
    deps.isPortAvailable = vi.fn().mockResolvedValue(false);

    await resolvePort(deps);

    expect(deps.showDialog).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining('4050'),
      })
    );
  });

  it('connect-to-existing skips server start and uses existing port', async () => {
    deps.isPortAvailable = vi.fn().mockResolvedValue(false);
    deps.showDialog = vi.fn().mockResolvedValue(0); // First button = Connect

    const result = await resolvePort(deps);

    expect(result).toEqual<PortResolution>({
      port: 4050,
      startServer: false,
    });
  });

  it('start-new finds next available port and starts server', async () => {
    deps.isPortAvailable = vi.fn().mockResolvedValue(false);
    deps.showDialog = vi.fn().mockResolvedValue(1); // Second button = Start New
    deps.findAvailablePort = vi.fn().mockResolvedValue(4051);

    const result = await resolvePort(deps);

    expect(result).toEqual<PortResolution>({
      port: 4051,
      startServer: true,
    });
    expect(deps.findAvailablePort).toHaveBeenCalledWith(4051);
  });

  it('handles isPortAvailable errors gracefully', async () => {
    deps.isPortAvailable = vi.fn().mockRejectedValue(new Error('check failed'));

    const result = await resolvePort(deps);

    // On error, proceed with default port (optimistic)
    expect(result).toEqual<PortResolution>({
      port: 4050,
      startServer: true,
    });
    expect(deps.warn).toHaveBeenCalledWith(
      expect.stringContaining('Port conflict check failed'),
      expect.any(Error)
    );
  });
});
