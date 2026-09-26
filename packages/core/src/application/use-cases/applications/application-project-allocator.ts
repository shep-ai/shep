/**
 * Application Project Allocator
 *
 * Naming rules shared by every way of starting an Application: a slug stem
 * from the description, a random tag so each slug is unique on disk and in
 * the DB, and a display name from the stem. Allocation creates the empty
 * project folder via CreateProjectUseCase.
 *
 * Used by CreateApplicationUseCase (Vite + shadcn starter) and
 * StartApplicationUseCase (blank starter) so both produce identical names.
 */

import { randomBytes } from 'node:crypto';
import type { IApplicationRepository } from '../../ports/output/repositories/application-repository.interface.js';
import type { CreateProjectUseCase } from '../projects/create-project.use-case.js';

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

/** Words of the description kept in the slug stem. */
const SLUG_STEM_WORDS = 5;

/** Slug stem used when the description has no meaningful words. */
const FALLBACK_SLUG_STEM = 'application';

/** Attempts at a unique `<stem>-<tag>` before giving up. */
const MAX_ALLOCATION_ATTEMPTS = 5;

export function slugifyApplicationDescription(description: string): string {
  const words = description
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .split(/\s+/)
    .filter((w) => w.length > 0 && !STOP_WORDS.has(w));

  const slug = words.slice(0, SLUG_STEM_WORDS).join('-');
  return slug || FALLBACK_SLUG_STEM;
}

export function applicationDisplayName(slugStem: string): string {
  return slugStem
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/**
 * 6-character lowercase hex tag (~16M combinations). Appended to every
 * application slug so each one is unique on disk and in the DB without
 * needing a sequential lookup-and-retry against existing rows. Random
 * also avoids the failure mode where a stale folder (left over from a
 * deleted DB row) blocks recreation under the same description.
 */
export function randomSlugTag(): string {
  return randomBytes(3).toString('hex');
}

export interface AllocatedApplicationProject {
  /** Unique `<stem>-<tag>` slug, also the project folder name. */
  slug: string;
  /** Human-readable name from the stem (without the random tag). */
  name: string;
  /** Absolute path of the new empty project folder. */
  projectPath: string;
}

export class ApplicationProjectAllocator {
  constructor(
    private readonly appRepo: IApplicationRepository,
    private readonly createProject: CreateProjectUseCase
  ) {}

  /**
   * Generate `<stem>-<random>` candidates until both the DB has no row
   * with that slug AND CreateProjectUseCase reports the folder doesn't
   * exist, then create the folder.
   */
  async allocate(description: string): Promise<AllocatedApplicationProject> {
    const stem = slugifyApplicationDescription(description);
    let lastError: string | undefined;

    for (let attempt = 0; attempt < MAX_ALLOCATION_ATTEMPTS; attempt++) {
      const candidate = `${stem}-${randomSlugTag()}`;

      const existing = await this.appRepo.findBySlug(candidate);
      if (existing) continue;

      const result = await this.createProject.execute({ name: candidate });
      if (result.ok) {
        return { slug: candidate, name: applicationDisplayName(stem), projectPath: result.path };
      }
      // Folder already exists (extremely unlikely with a random tag) — retry.
      lastError = result.error;
    }

    throw new Error(
      lastError ??
        `Failed to allocate a unique slug for "${stem}" after ${MAX_ALLOCATION_ATTEMPTS} attempts.`
    );
  }
}
