/**
 * `shep bedrock doctor` command tests.
 *
 * Renders the per-tier health table via the shared ui module.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Command } from 'commander';
import type { BedrockHealth } from '@/domain/generated/output.js';

const { mockUseCase, mockMessages, mockRenderListView } = vi.hoisted(() => ({
  mockUseCase: { execute: vi.fn() },
  mockMessages: {
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
    newline: vi.fn(),
    log: vi.fn(),
  },
  mockRenderListView: vi.fn(),
}));

vi.mock('@/infrastructure/di/container.js', () => ({
  container: {
    resolve: vi.fn().mockImplementation((token: string) => {
      if (token === 'CheckBedrockHealthUseCase') return mockUseCase;
      throw new Error(`Unexpected DI token: ${token}`);
    }),
  },
}));

vi.mock('../../../../src/presentation/cli/ui/index.js', () => ({
  messages: mockMessages,
  colors: {
    muted: (s: string) => s,
    accent: (s: string) => s,
    success: (s: string) => s,
    error: (s: string) => s,
    warning: (s: string) => s,
    info: (s: string) => s,
  },
  fmt: { code: (s: string) => s, heading: (s: string) => s, label: (s: string) => s },
  renderListView: mockRenderListView,
}));

import { createBedrockDoctorCommand } from '../../../../src/presentation/cli/commands/bedrock/doctor.command.js';

const healthyReport: BedrockHealth = {
  python: { tier: 'python', status: 'ok', detail: 'Python 3.11.4' },
  pipx: { tier: 'pipx', status: 'ok', detail: 'pipx 1.4.0' },
  bedrock: { tier: 'bedrock', status: 'ok', detail: 'bedrock 0.5.0' },
  overall: 'ok',
};

const brokenReport: BedrockHealth = {
  python: { tier: 'python', status: 'ok', detail: 'Python 3.11.4' },
  pipx: {
    tier: 'pipx',
    status: 'missing',
    detail: 'pipx not found',
    remediation: 'Run `brew install pipx`',
  },
  bedrock: {
    tier: 'bedrock',
    status: 'missing',
    detail: 'bedrock not found',
    remediation: 'Run `pipx install project-bedrock`',
  },
  overall: 'missing',
};

describe('shep bedrock doctor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.exitCode = undefined;
  });

  it('returns a Commander Command instance named "doctor"', () => {
    const cmd = createBedrockDoctorCommand();
    expect(cmd).toBeInstanceOf(Command);
    expect(cmd.name()).toBe('doctor');
  });

  it('resolves CheckBedrockHealthUseCase and renders a table with per-tier rows', async () => {
    mockUseCase.execute.mockResolvedValue(healthyReport);

    const cmd = createBedrockDoctorCommand();
    await cmd.parseAsync([], { from: 'user' });

    expect(mockUseCase.execute).toHaveBeenCalledTimes(1);
    expect(mockRenderListView).toHaveBeenCalledTimes(1);
    const config = mockRenderListView.mock.calls[0][0];
    expect(config.rows.length).toBe(3);
    const flat = config.rows.flat().join(' ');
    expect(flat).toContain('python');
    expect(flat).toContain('pipx');
    expect(flat).toContain('bedrock');
  });

  it('does not set exitCode when overall=ok', async () => {
    mockUseCase.execute.mockResolvedValue(healthyReport);
    const cmd = createBedrockDoctorCommand();
    await cmd.parseAsync([], { from: 'user' });
    expect(process.exitCode).toBeUndefined();
  });

  it('sets exitCode=1 and surfaces remediation when a tier is missing', async () => {
    mockUseCase.execute.mockResolvedValue(brokenReport);

    const cmd = createBedrockDoctorCommand();
    await cmd.parseAsync([], { from: 'user' });

    expect(process.exitCode).toBe(1);
    const rendered = mockRenderListView.mock.calls[0][0];
    const flat = rendered.rows.flat().join(' ');
    expect(flat).toContain('missing');
    const infoOutput = mockMessages.info.mock.calls.map((c) => String(c[0])).join('\n');
    expect(infoOutput).toContain('brew install pipx');
    expect(infoOutput).toContain('pipx install project-bedrock');
  });
});
