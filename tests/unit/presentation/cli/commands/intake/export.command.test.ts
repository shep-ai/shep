import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockResolve, mockExportExecute, mockGetProjectExecute } = vi.hoisted(() => ({
  mockResolve: vi.fn(),
  mockExportExecute: vi.fn(),
  mockGetProjectExecute: vi.fn(),
}));

vi.mock('@/infrastructure/di/container.js', () => ({
  container: {
    resolve: (...args: unknown[]) => mockResolve(...args),
  },
}));

vi.mock('@/application/use-cases/import-export/export-work-items-csv.use-case.js', () => ({
  ExportWorkItemsCsvUseCase: class {
    execute = mockExportExecute;
  },
}));

vi.mock('@/application/use-cases/pm-projects/get-pm-project.use-case.js', () => ({
  GetPmProjectUseCase: class {
    execute = mockGetProjectExecute;
  },
}));

import { createExportCommand } from '../../../../../../src/presentation/cli/commands/item/export.command.js';

describe('item export command', () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(vi.fn());
    vi.spyOn(console, 'error').mockImplementation(vi.fn());
    mockGetProjectExecute.mockResolvedValue({
      ok: true,
      project: { id: 'proj-1', name: 'Test', slug: 'test' },
    });
    mockResolve.mockImplementation((token: unknown) => {
      if (typeof token === 'function' && token.name === 'GetPmProjectUseCase') {
        return { execute: mockGetProjectExecute };
      }
      return { execute: mockExportExecute };
    });
    process.exitCode = undefined;
  });

  it('should create a command named "export"', () => {
    const cmd = createExportCommand();
    expect(cmd.name()).toBe('export');
  });

  it('should export CSV and print to stdout', async () => {
    mockExportExecute.mockResolvedValue({
      ok: true,
      csv: 'Title,Priority\nBug fix,High\n',
      itemCount: 1,
    });

    const cmd = createExportCommand();
    await cmd.parseAsync(['test'], { from: 'user' });

    const output = consoleSpy.mock.calls.map((c: unknown[]) => c[0]).join('\n');
    expect(output).toContain('Title,Priority');
  });

  it('should set exitCode on project not found', async () => {
    mockGetProjectExecute.mockResolvedValue({ ok: false, error: 'Not found' });

    const cmd = createExportCommand();
    await cmd.parseAsync(['nonexistent'], { from: 'user' });

    expect(process.exitCode).toBe(1);
  });
});
