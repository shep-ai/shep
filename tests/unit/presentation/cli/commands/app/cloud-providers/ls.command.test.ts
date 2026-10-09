/**
 * `shep app cloud-providers ls` unit tests.
 *
 * Only Cloudflare Pages is listed, and the command never prints a
 * "coming soon" row (the placeholder providers were removed in spec 135).
 */

import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CloudDeploymentProvider } from '@/domain/generated/output.js';

const { mockResolve, mockExecute } = vi.hoisted(() => ({
  mockResolve: vi.fn(),
  mockExecute: vi.fn(),
}));

vi.mock('@/infrastructure/di/container.js', () => ({
  container: {
    resolve: (...args: unknown[]) => mockResolve(...args),
  },
}));

vi.mock('@/application/use-cases/cloud-deploy/list-cloud-providers.use-case.js', () => ({
  ListCloudProvidersUseCase: class {
    execute = mockExecute;
  },
}));

import { createCloudProvidersLsCommand } from '../../../../../../../src/presentation/cli/commands/app/cloud-providers/ls.command.js';

describe('app cloud-providers ls command', () => {
  let stdout: string[];

  beforeEach(() => {
    vi.clearAllMocks();
    stdout = [];
    vi.spyOn(process.stdout, 'write').mockImplementation((chunk: string | Uint8Array) => {
      stdout.push(String(chunk));
      return true;
    });
    vi.spyOn(console, 'error').mockImplementation(vi.fn());
    mockResolve.mockReturnValue({ execute: mockExecute });
    process.exitCode = undefined;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('prints Cloudflare Pages with its connection state and no coming-soon row', async () => {
    mockExecute.mockResolvedValue([
      {
        id: CloudDeploymentProvider.CloudflarePages,
        displayName: 'Cloudflare Pages',
        connected: false,
      },
    ]);

    await createCloudProvidersLsCommand().parseAsync([], { from: 'user' });

    const output = stdout.join('');
    expect(output).toContain('Cloudflare Pages');
    expect(output).toContain('not connected');
    expect(output).toContain('●');
    expect(output.toLowerCase()).not.toContain('coming soon');
    expect(process.exitCode).toBeUndefined();
  });

  it('prints connected for a provider with a stored token', async () => {
    mockExecute.mockResolvedValue([
      {
        id: CloudDeploymentProvider.CloudflarePages,
        displayName: 'Cloudflare Pages',
        connected: true,
      },
    ]);

    await createCloudProvidersLsCommand().parseAsync([], { from: 'user' });

    const output = stdout.join('');
    expect(output).toMatch(/Cloudflare Pages\s+.*connected/);
    expect(output).not.toContain('not connected');
  });
});
