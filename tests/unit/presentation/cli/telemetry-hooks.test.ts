import 'reflect-metadata';
import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import { Command } from 'commander';
import { TelemetryEvent } from '@/domain/generated/output.js';
import { TELEMETRY_NOTICE_FIELDS } from '@/domain/shared/telemetry/telemetry-notice.js';

const { mockResolve } = vi.hoisted(() => ({ mockResolve: vi.fn() }));

vi.mock('@/infrastructure/di/container.js', () => ({
  container: { resolve: (...args: unknown[]) => mockResolve(...args) },
}));

import { initI18n } from '../../../../src/presentation/cli/i18n.js';
import {
  commandPath,
  recordUnhandledError,
  registerTelemetryHooks,
} from '../../../../src/presentation/cli/telemetry-hooks.js';

describe('CLI telemetry hooks', () => {
  const record = vi.fn();
  const acknowledge = vi.fn();
  const recordError = vi.fn();
  let stderr: string;

  beforeAll(async () => {
    await initI18n('en');
  });

  beforeEach(() => {
    vi.clearAllMocks();
    stderr = '';
    vi.spyOn(process.stderr, 'write').mockImplementation((chunk: string | Uint8Array) => {
      stderr += String(chunk);
      return true;
    });
    acknowledge.mockResolvedValue({ show: false, fields: TELEMETRY_NOTICE_FIELDS });
    mockResolve.mockImplementation((token: { name?: string }) => {
      switch (token.name) {
        case 'RecordTelemetryEventUseCase':
          return { execute: record };
        case 'AcknowledgeTelemetryNoticeUseCase':
          return { execute: acknowledge };
        case 'RecordUnhandledErrorUseCase':
          return { execute: recordError };
        default:
          throw new Error(`unexpected token ${String(token.name)}`);
      }
    });
  });

  function program() {
    const root = new Command('shep').exitOverride();
    root.action(() => undefined);
    const feat = new Command('feat');
    feat.addCommand(new Command('new').argument('[title]').action(() => undefined));
    root.addCommand(feat);
    root.addCommand(new Command('_serve').action(() => undefined));
    registerTelemetryHooks(root);
    return root;
  }

  it('builds the command path from names, never arguments', () => {
    const root = new Command('shep');
    const feat = new Command('feat');
    const leaf = new Command('new');
    feat.addCommand(leaf);
    root.addCommand(feat);
    expect(commandPath(leaf)).toBe('feat new');
    expect(commandPath(root)).toBe('');
  });

  it('records cli.command with the command path only', async () => {
    await program().parseAsync(['feat', 'new', 'secret feature title'], { from: 'user' });
    expect(record).toHaveBeenCalledWith(TelemetryEvent.CliCommand, { command: 'feat new' });
    expect(JSON.stringify(record.mock.calls)).not.toContain('secret');
  });

  it('records the bare `shep` invocation as the default command', async () => {
    await program().parseAsync([], { from: 'user' });
    expect(record).toHaveBeenCalledWith(TelemetryEvent.CliCommand, { command: 'shep' });
  });

  it('records nothing and shows no notice for internal commands', async () => {
    await program().parseAsync(['_serve'], { from: 'user' });
    expect(record).not.toHaveBeenCalled();
    expect(acknowledge).not.toHaveBeenCalled();
  });

  it('prints the first-run notice to stderr, listing every field', async () => {
    acknowledge.mockResolvedValue({ show: true, fields: TELEMETRY_NOTICE_FIELDS });
    await program().parseAsync(['feat', 'new'], { from: 'user' });

    expect(stderr).toContain('Shep collects usage metrics');
    expect(stderr).toContain('a random install id');
    expect(stderr).toContain('a SHA-256 hash of your Claude or Codex account id');
    expect(stderr).toContain('your GitHub username');
    expect(stderr).toContain('GitHub owners');
    expect(stderr).toContain('contact you on GitHub');
    expect(stderr).toContain('shep telemetry off');
  });

  it('never lets telemetry break the command', async () => {
    record.mockImplementation(() => {
      throw new Error('boom');
    });
    acknowledge.mockRejectedValue(new Error('db locked'));
    await expect(program().parseAsync(['feat', 'new'], { from: 'user' })).resolves.toBeDefined();
  });

  it('records unhandled errors and swallows failures to do so', () => {
    const error = new Error('x');
    recordUnhandledError(error);
    expect(recordError).toHaveBeenCalledWith(error);

    mockResolve.mockImplementation(() => {
      throw new Error('container not ready');
    });
    expect(() => recordUnhandledError(error)).not.toThrow();
  });
});
