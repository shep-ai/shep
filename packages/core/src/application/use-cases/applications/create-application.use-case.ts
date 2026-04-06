/**
 * Create Application Use Case
 *
 * Scaffolds a new project directory (via CreateProjectUseCase), derives a unique slug
 * from the user's description, and persists a new Application entity.
 */

import { injectable, inject } from 'tsyringe';
import { randomUUID } from 'node:crypto';
import type { Application } from '../../../domain/generated/output.js';
import { ApplicationStatus } from '../../../domain/generated/output.js';
import type { IApplicationRepository } from '../../ports/output/repositories/application-repository.interface.js';
import type { CreateProjectUseCase } from '../projects/create-project.use-case.js';

export interface CreateApplicationInput {
  description: string;
  agentType?: string;
  modelOverride?: string;
}

export interface CreateApplicationResult {
  application: Application;
  repositoryPath: string;
}

/** Stop words stripped when building the application slug. */
const STOP_WORDS = new Set([
  'a',
  'an',
  'the',
  'and',
  'or',
  'but',
  'with',
  'for',
  'in',
  'on',
  'to',
  'of',
  'is',
  'it',
  'that',
  'this',
  'my',
  'our',
  'your',
  'me',
  'i',
  'build',
  'create',
  'make',
  'add',
  'implement',
  'develop',
  'write',
]);

function slugify(description: string): string {
  const words = description
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .split(/\s+/)
    .filter((w) => w.length > 0 && !STOP_WORDS.has(w));

  const slug = words.slice(0, 5).join('-');
  return slug || 'application';
}

function toTitleCase(slug: string): string {
  return slug
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

@injectable()
export class CreateApplicationUseCase {
  constructor(
    @inject('IApplicationRepository')
    private readonly appRepo: IApplicationRepository,
    @inject('CreateProjectUseCase')
    private readonly createProject: CreateProjectUseCase
  ) {}

  async execute(input: CreateApplicationInput): Promise<CreateApplicationResult> {
    // 1. Generate slug from description
    const baseSlug = slugify(input.description);

    // 2. Resolve unique slug against existing applications (append -2, -3 …).
    //    We do this BEFORE scaffolding so the project folder gets the same
    //    unique name and CreateProjectUseCase's "folder already exists" guard
    //    never fires for two siblings with similar descriptions.
    const slug = await this.resolveUniqueSlug(baseSlug);

    // 3. Scaffold project directory + git init. CreateProjectUseCase owns
    //    validation / slug clamping and returns the absolute path to the
    //    created folder.
    const projectResult = await this.createProject.execute({ name: slug });
    if (!projectResult.ok) {
      throw new Error(projectResult.error);
    }
    const projectPath = projectResult.path;

    // 4. Generate name from slug (title-case)
    const name = toTitleCase(slug);

    // 5. Create Application record
    const now = new Date();
    const application: Application = {
      id: randomUUID(),
      name,
      slug,
      description: input.description,
      repositoryPath: projectPath,
      additionalPaths: [],
      status: ApplicationStatus.Idle,
      agentType: input.agentType,
      modelOverride: input.modelOverride,
      createdAt: now,
      updatedAt: now,
    };

    await this.appRepo.create(application);

    // 6. Return application + repositoryPath
    return { application, repositoryPath: projectPath };
  }

  /**
   * Returns a unique slug. If `baseSlug` already exists, appends -2, -3 etc.
   */
  private async resolveUniqueSlug(baseSlug: string): Promise<string> {
    const existing = await this.appRepo.findBySlug(baseSlug);
    if (!existing) return baseSlug;

    for (let i = 2; i < 100; i++) {
      const candidate = `${baseSlug}-${i}`;
      const conflict = await this.appRepo.findBySlug(candidate);
      if (!conflict) return candidate;
    }

    // Fallback — extremely unlikely
    return `${baseSlug}-${Date.now()}`;
  }
}
