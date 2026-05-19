/**
 * Resolve Application Helper Unit Tests
 *
 * Tests for the shared helper that resolves an application
 * by exact ID, slug, or prefix.
 *
 * TDD Phase: RED-GREEN
 */

import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Application } from '@/domain/generated/output.js';
import { ApplicationStatus } from '@/domain/generated/output.js';

const { mockContainerResolve, mockFindById, mockFindBySlug, mockList } = vi.hoisted(() => ({
  mockContainerResolve: vi.fn(),
  mockFindById: vi.fn(),
  mockFindBySlug: vi.fn(),
  mockList: vi.fn(),
}));

vi.mock('@/infrastructure/di/container.js', () => ({
  container: {
    resolve: (...args: unknown[]) => mockContainerResolve(...args),
  },
}));

import { resolveApplication } from '../../../../../../src/presentation/cli/commands/app/resolve-application.js';

function makeApplication(overrides?: Partial<Application>): Application {
  return {
    id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    name: 'Todo App',
    slug: 'todo-app-f3a2c1',
    description: 'Build a todo list app',
    repositoryPath: '/home/user/.shep/projects/todo-app-f3a2c1',
    additionalPaths: [],
    status: ApplicationStatus.Idle,
    setupComplete: false,
    bedrockEnabled: false,
    createdAt: new Date('2025-01-01'),
    updatedAt: new Date('2025-01-01'),
    ...overrides,
  };
}

describe('resolveApplication', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockContainerResolve.mockReturnValue({
      findById: mockFindById,
      findBySlug: mockFindBySlug,
      list: mockList,
    });
    mockFindById.mockResolvedValue(null);
    mockFindBySlug.mockResolvedValue(null);
    mockList.mockResolvedValue([]);
  });

  it('should resolve by exact ID', async () => {
    const app = makeApplication();
    mockFindById.mockResolvedValue(app);

    const result = await resolveApplication('a1b2c3d4-e5f6-7890-abcd-ef1234567890');

    expect(result).toEqual({ application: app });
    expect(mockFindById).toHaveBeenCalledWith('a1b2c3d4-e5f6-7890-abcd-ef1234567890');
  });

  it('should resolve by slug when exact ID not found', async () => {
    const app = makeApplication();
    mockFindById.mockResolvedValue(null);
    mockFindBySlug.mockResolvedValue(app);

    const result = await resolveApplication('todo-app-f3a2c1');

    expect(result).toEqual({ application: app });
    expect(mockFindBySlug).toHaveBeenCalledWith('todo-app-f3a2c1');
  });

  it('should resolve by prefix when ID and slug not found', async () => {
    const app = makeApplication();
    mockFindById.mockResolvedValue(null);
    mockFindBySlug.mockResolvedValue(null);
    mockList.mockResolvedValue([app]);

    const result = await resolveApplication('a1b2c3d4');

    expect(result).toEqual({ application: app });
  });

  it('should return error when multiple applications match prefix', async () => {
    const app1 = makeApplication({ id: 'a1b2c3d4-1111-1111-1111-111111111111' });
    const app2 = makeApplication({ id: 'a1b2c3d4-2222-2222-2222-222222222222' });
    mockList.mockResolvedValue([app1, app2]);

    const result = await resolveApplication('a1b2c3d4');

    expect(result).toHaveProperty('error');
    expect((result as { error: string }).error).toContain('Multiple applications match');
  });

  it('should return error when no application found', async () => {
    const result = await resolveApplication('nonexistent');

    expect(result).toHaveProperty('error');
    expect((result as { error: string }).error).toContain('Application not found');
  });
});
