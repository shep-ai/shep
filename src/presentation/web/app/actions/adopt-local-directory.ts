'use server';

import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { resolve } from '@/lib/server-container';
import type { IApplicationRepository } from '@shepai/core/application/ports/output/repositories/application-repository.interface';
import { ApplicationStatus } from '@shepai/core/domain/generated/output';

/**
 * Create an Application entity pointing at an EXISTING local directory.
 *
 * Unlike `createApplication` (which scaffolds a brand-new project),
 * this action registers a directory the user already has on disk — e.g.
 * an existing Next.js or Vite repo. No scaffold is run; the folder is
 * used as-is and `setupComplete` is set to `true` so the application
 * page doesn't try to re-scaffold it.
 *
 * The display name is derived from the folder's base name so the card
 * shows something human-readable immediately.
 */
export async function adoptLocalDirectory(input: {
  repositoryPath: string;
}): Promise<{ applicationId?: string; error?: string }> {
  const normalizedPath = input.repositoryPath.replace(/\\/g, '/');
  const folderName = path.basename(normalizedPath);

  if (!folderName) {
    return { error: 'Could not determine folder name from path' };
  }

  try {
    const appRepo = resolve<IApplicationRepository>('IApplicationRepository');
    const now = new Date();
    const applicationId = randomUUID();

    await appRepo.create({
      id: applicationId,
      name: toTitleCase(folderName),
      slug: folderName,
      description: `Local project at ${normalizedPath}`,
      repositoryPath: normalizedPath,
      additionalPaths: [],
      status: ApplicationStatus.Idle,
      setupComplete: true,
      bedrockEnabled: false,
      createdAt: now,
      updatedAt: now,
    });

    return { applicationId };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to adopt directory';
    return { error: message };
  }
}

function toTitleCase(slug: string): string {
  return slug.replace(/[-_]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}
