import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  CreateProjectUseCase,
  slugifyProjectName,
} from '@/application/use-cases/projects/create-project.use-case.js';
import type { IProjectScaffoldService } from '@/application/ports/output/services/project-scaffold-service.interface.js';

function createMockScaffold(): IProjectScaffoldService {
  return {
    projectExists: vi.fn().mockResolvedValue(false),
    scaffoldProject: vi.fn().mockResolvedValue({ path: '/shep/projects/my-project' }),
  };
}

describe('slugifyProjectName', () => {
  it('lowercases and replaces whitespace with dashes', () => {
    expect(slugifyProjectName('My New Project')).toBe('my-new-project');
  });

  it('strips invalid characters', () => {
    expect(slugifyProjectName('Hello, World!')).toBe('hello-world');
  });

  it('collapses runs of dashes from sequences of invalid characters', () => {
    expect(slugifyProjectName('foo!!!@@@bar')).toBe('foo-bar');
  });

  it('preserves underscores and dots within the name', () => {
    expect(slugifyProjectName('my_project.v1')).toBe('my_project.v1');
  });

  it('strips leading and trailing dashes/dots', () => {
    expect(slugifyProjectName('..foo--')).toBe('foo');
  });

  it('caps length at 64 characters', () => {
    const long = 'a'.repeat(200);
    expect(slugifyProjectName(long)).toHaveLength(64);
  });

  it('returns empty string when name has no valid characters', () => {
    expect(slugifyProjectName('!!!')).toBe('');
  });
});

describe('CreateProjectUseCase', () => {
  let useCase: CreateProjectUseCase;
  let mockScaffold: IProjectScaffoldService;

  beforeEach(() => {
    mockScaffold = createMockScaffold();
    useCase = new CreateProjectUseCase(mockScaffold);
  });

  it('creates a project when the slug is available', async () => {
    vi.mocked(mockScaffold.scaffoldProject).mockResolvedValue({
      path: '/shep/projects/my-project',
    });

    const result = await useCase.execute({ name: 'My Project' });

    expect(result).toEqual({ ok: true, path: '/shep/projects/my-project' });
    expect(mockScaffold.projectExists).toHaveBeenCalledWith('my-project');
    expect(mockScaffold.scaffoldProject).toHaveBeenCalledWith({ slug: 'my-project' });
  });

  it('rejects an empty name', async () => {
    const result = await useCase.execute({ name: '   ' });

    expect(result).toEqual({ ok: false, error: 'Project name is required.' });
    expect(mockScaffold.projectExists).not.toHaveBeenCalled();
    expect(mockScaffold.scaffoldProject).not.toHaveBeenCalled();
  });

  it('rejects a name that slugifies to nothing', async () => {
    const result = await useCase.execute({ name: '!!!' });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/at least one letter or number/);
    }
    expect(mockScaffold.scaffoldProject).not.toHaveBeenCalled();
  });

  it('fails when a project with the same slug already exists', async () => {
    vi.mocked(mockScaffold.projectExists).mockResolvedValue(true);

    const result = await useCase.execute({ name: 'My Project' });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/already exists/);
    }
    expect(mockScaffold.scaffoldProject).not.toHaveBeenCalled();
  });

  it('returns an error when the scaffold service throws', async () => {
    vi.mocked(mockScaffold.scaffoldProject).mockRejectedValue(new Error('disk full'));

    const result = await useCase.execute({ name: 'My Project' });

    expect(result).toEqual({ ok: false, error: 'disk full' });
  });

  it('returns a generic error when the scaffold service throws a non-Error', async () => {
    vi.mocked(mockScaffold.scaffoldProject).mockRejectedValue('boom');

    const result = await useCase.execute({ name: 'My Project' });

    expect(result).toEqual({ ok: false, error: 'Failed to create project folder.' });
  });
});
