/**
 * Create Project Use Case
 *
 * Orchestrates "create a new empty project folder under the Shep projects
 * root". Owns the project naming rules (validation, slugification, length
 * cap) and the "must not already exist" guard. Delegates filesystem and git
 * work to IProjectScaffoldService so the application layer remains free of
 * node:fs / child_process imports.
 *
 * Presentation-agnostic: callable from CLI, TUI, and Web identically.
 */

import { injectable, inject } from 'tsyringe';

import type { IProjectScaffoldService } from '../../ports/output/services/project-scaffold-service.interface.js';

export interface CreateProjectInput {
  /** User-supplied project name. Will be slugified for the directory name. */
  name: string;
}

export interface CreateProjectSuccess {
  ok: true;
  /** Absolute path to the created folder, normalized to forward slashes. */
  path: string;
}

export interface CreateProjectFailure {
  ok: false;
  error: string;
}

export type CreateProjectResult = CreateProjectSuccess | CreateProjectFailure;

/**
 * Slugify a user-supplied project name into a safe directory name.
 *
 * - Lowercases
 * - Replaces whitespace + invalid chars with `-`
 * - Strips leading/trailing dashes and dots
 * - Caps length so we stay well under Windows' 260-char path limit
 *
 * Exported for unit testing — production callers should use the use case.
 */
export function slugifyProjectName(name: string): string {
  const cleaned = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '');
  return cleaned.slice(0, 64);
}

@injectable()
export class CreateProjectUseCase {
  constructor(
    @inject('IProjectScaffoldService')
    private readonly scaffoldService: IProjectScaffoldService
  ) {}

  async execute(input: CreateProjectInput): Promise<CreateProjectResult> {
    const trimmed = input.name.trim();
    if (!trimmed) {
      return { ok: false, error: 'Project name is required.' };
    }

    const slug = slugifyProjectName(trimmed);
    if (!slug) {
      return {
        ok: false,
        error: 'Project name must contain at least one letter or number.',
      };
    }

    if (await this.scaffoldService.projectExists(slug)) {
      return {
        ok: false,
        error: `A project named "${slug}" already exists. Pick a different name.`,
      };
    }

    try {
      const result = await this.scaffoldService.scaffoldProject({ slug });
      return { ok: true, path: result.path };
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : 'Failed to create project folder.',
      };
    }
  }
}
