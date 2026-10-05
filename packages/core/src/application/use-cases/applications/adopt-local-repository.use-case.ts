/**
 * AdoptLocalRepositoryUseCase: the application for a folder that already
 * exists on disk — the one registered at that path, or a new one named
 * after the folder. Nothing is scaffolded; the folder is used as it is.
 */

import { randomUUID } from 'node:crypto';
import { injectable, inject } from 'tsyringe';
import { ApplicationStatus, type Application } from '../../../domain/generated/output.js';
import { normalizePath } from '../../../domain/shared/normalize-path.js';
import type { IApplicationRepository } from '../../ports/output/repositories/application-repository.interface.js';

export type AdoptLocalRepositoryResult =
  | { ok: true; application: Application; adopted: boolean }
  | { ok: false; error: string };

function titleCase(slug: string): string {
  return slug.replace(/[-_]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

@injectable()
export class AdoptLocalRepositoryUseCase {
  constructor(
    @inject('IApplicationRepository') private readonly applications: IApplicationRepository
  ) {}

  async execute(repositoryPath: string): Promise<AdoptLocalRepositoryResult> {
    const path = normalizePath(repositoryPath.trim()).replace(/\/+$/, '');
    const folder = path.split('/').pop() ?? '';
    if (!folder) return { ok: false, error: 'Could not determine folder name from path' };

    const existing = await this.applications.findByPath(path);
    if (existing) return { ok: true, application: existing, adopted: false };

    const now = new Date();
    const application: Application = {
      id: randomUUID(),
      name: titleCase(folder),
      slug: folder,
      description: `Local project at ${path}`,
      repositoryPath: path,
      additionalPaths: [],
      status: ApplicationStatus.Idle,
      setupComplete: true,
      bedrockEnabled: false,
      createdAt: now,
      updatedAt: now,
    };
    await this.applications.create(application);
    return { ok: true, application, adopted: true };
  }
}
