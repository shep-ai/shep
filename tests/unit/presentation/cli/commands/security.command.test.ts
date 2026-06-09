/**
 * Security Command Unit Tests
 */

import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Hoisted mocks — referenced from vi.mock factories which run before top-level
// const initialization. vi.hoisted lifts these to the top of the file.
const { getSettingsMock, useCaseExecuteMock, messagesInfoMock } = vi.hoisted(() => ({
  getSettingsMock: vi.fn(),
  useCaseExecuteMock: vi.fn(),
  messagesInfoMock: vi.fn(),
}));

// Mock settings service — allow per-test overrides of featureFlags.supplyChainSecurity
vi.mock('@/infrastructure/services/settings.service.js', () => ({
  getSettings: () => getSettingsMock(),
}));

// Mock DI container
vi.mock('@/infrastructure/di/container.js', () => ({
  container: {
    resolve: vi.fn(() => ({ execute: useCaseExecuteMock })),
  },
}));

// Mock i18n to return key as translation
vi.mock('../../../../../src/presentation/cli/i18n.js', () => ({
  getCliI18n: () => ({
    t: (key: string) => key,
  }),
}));

// Mock UI — expose messages.info so tests can assert on flag-disabled note
vi.mock('../../../../../src/presentation/cli/ui/index.js', () => ({
  messages: {
    error: vi.fn(),
    info: messagesInfoMock,
    success: vi.fn(),
    warning: vi.fn(),
    newline: vi.fn(),
    log: vi.fn(),
  },
  colors: {
    error: (s: string) => s,
    warning: (s: string) => s,
    muted: (s: string) => s,
    brand: (s: string) => s,
    success: (s: string) => s,
  },
  fmt: {
    label: (s: string) => s,
    heading: (s: string) => s,
  },
}));

import { createSecurityCommand } from '../../../../../src/presentation/cli/commands/security.command.js';

describe('createSecurityCommand', () => {
  it('should create a Commander command named security', () => {
    const cmd = createSecurityCommand();
    expect(cmd.name()).toBe('security');
  });

  it('should have an enforce subcommand', () => {
    const cmd = createSecurityCommand();
    const enforceCmd = cmd.commands.find((c) => c.name() === 'enforce');
    expect(enforceCmd).toBeDefined();
  });

  it('should have --repo and --output options on enforce', () => {
    const cmd = createSecurityCommand();
    const enforceCmd = cmd.commands.find((c) => c.name() === 'enforce');
    expect(enforceCmd).toBeDefined();

    const options = enforceCmd!.options;
    const repoOpt = options.find((o) => o.long === '--repo');
    const outputOpt = options.find((o) => o.long === '--output');
    expect(repoOpt).toBeDefined();
    expect(outputOpt).toBeDefined();
  });

  it('should default --output to table', () => {
    const cmd = createSecurityCommand();
    const enforceCmd = cmd.commands.find((c) => c.name() === 'enforce');
    const outputOpt = enforceCmd!.options.find((o) => o.long === '--output');
    expect(outputOpt!.defaultValue).toBe('table');
  });

  it('should default --repo to cwd', () => {
    const cmd = createSecurityCommand();
    const enforceCmd = cmd.commands.find((c) => c.name() === 'enforce');
    const repoOpt = enforceCmd!.options.find((o) => o.long === '--repo');
    expect(repoOpt!.defaultValue).toBe(process.cwd());
  });

  describe('supplyChainSecurity feature flag gate', () => {
    const originalEnv = process.env.SHEP_SUPPLY_CHAIN_SECURITY;

    beforeEach(() => {
      useCaseExecuteMock.mockReset();
      messagesInfoMock.mockReset();
      getSettingsMock.mockReset();
      delete process.env.SHEP_SUPPLY_CHAIN_SECURITY;
    });

    afterEach(() => {
      if (originalEnv === undefined) {
        delete process.env.SHEP_SUPPLY_CHAIN_SECURITY;
      } else {
        process.env.SHEP_SUPPLY_CHAIN_SECURITY = originalEnv;
      }
    });

    async function runEnforce(): Promise<void> {
      const cmd = createSecurityCommand();
      // Parse from the parent security command so the subcommand is matched correctly.
      await cmd.parseAsync(['enforce', '--repo', '/tmp/repo'], { from: 'user' });
    }

    it('becomes a no-op and skips the use case when featureFlags.supplyChainSecurity is false', async () => {
      getSettingsMock.mockReturnValue({ featureFlags: { supplyChainSecurity: false } });

      await runEnforce();

      expect(useCaseExecuteMock).not.toHaveBeenCalled();
      expect(messagesInfoMock).toHaveBeenCalledWith(
        'cli:commands.security.enforce.flagDisabledNote'
      );
    });

    it('becomes a no-op when SHEP_SUPPLY_CHAIN_SECURITY=false even if the settings flag is true', async () => {
      process.env.SHEP_SUPPLY_CHAIN_SECURITY = 'false';
      getSettingsMock.mockReturnValue({ featureFlags: { supplyChainSecurity: true } });

      await runEnforce();

      expect(useCaseExecuteMock).not.toHaveBeenCalled();
      expect(messagesInfoMock).toHaveBeenCalledWith(
        'cli:commands.security.enforce.flagDisabledNote'
      );
    });

    it('also honors SHEP_SUPPLY_CHAIN_SECURITY=0 as a disable value', async () => {
      process.env.SHEP_SUPPLY_CHAIN_SECURITY = '0';
      getSettingsMock.mockReturnValue({ featureFlags: { supplyChainSecurity: true } });

      await runEnforce();

      expect(useCaseExecuteMock).not.toHaveBeenCalled();
    });

    it('runs the use case when the flag is true and no env override is set', async () => {
      getSettingsMock.mockReturnValue({ featureFlags: { supplyChainSecurity: true } });
      useCaseExecuteMock.mockResolvedValue({
        mode: 'Advisory',
        policy: { source: 'settings-default' },
        totalFindings: 0,
        dependencyFindings: [],
        releaseIntegrity: { checks: [] },
        governanceFindings: [],
        passed: true,
      });

      await runEnforce();

      expect(useCaseExecuteMock).toHaveBeenCalledWith({ repositoryPath: '/tmp/repo' });
    });

    it('runs the use case when featureFlags is absent (defaults to enabled)', async () => {
      getSettingsMock.mockReturnValue({});
      useCaseExecuteMock.mockResolvedValue({
        mode: 'Advisory',
        policy: { source: 'settings-default' },
        totalFindings: 0,
        dependencyFindings: [],
        releaseIntegrity: { checks: [] },
        governanceFindings: [],
        passed: true,
      });

      await runEnforce();

      expect(useCaseExecuteMock).toHaveBeenCalled();
    });
  });
});
