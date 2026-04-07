'use server';

import { mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { join } from 'node:path';
import { getShepHomeDir } from '@shepai/core/infrastructure/services/filesystem/shep-directory.service';
import { IS_WINDOWS } from '@shepai/core/infrastructure/platform';

const execFileAsync = promisify(execFile);

export interface CreateProjectFolderResult {
  ok: boolean;
  /** Absolute path to the created folder, normalized to forward slashes. */
  path?: string;
  error?: string;
}

/**
 * Slugify a user-supplied project name into a safe directory name.
 *
 * - Lowercases
 * - Replaces whitespace + invalid chars with `-`
 * - Strips leading/trailing dashes and dots
 * - Caps length so we stay well under Windows' 260-char path limit
 */
function slugifyProjectName(name: string): string {
  const cleaned = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '');
  return cleaned.slice(0, 64);
}

/**
 * Create a new empty project folder under `$SHEP_HOME/projects/<slug>` and
 * return its absolute path. The caller can then feed that path into the
 * normal "add repository" flow — git will be initialised on adoption.
 *
 * Fails (without overwriting) if the slug already exists.
 */
export async function createProjectFolder(name: string): Promise<CreateProjectFolderResult> {
  const trimmed = name.trim();
  if (!trimmed) {
    return { ok: false, error: 'Project name is required.' };
  }

  const slug = slugifyProjectName(trimmed);
  if (!slug) {
    return { ok: false, error: 'Project name must contain at least one letter or number.' };
  }

  const projectsRoot = join(getShepHomeDir(), 'projects');
  const projectPath = join(projectsRoot, slug);

  if (existsSync(projectPath)) {
    return {
      ok: false,
      error: `A project named "${slug}" already exists. Pick a different name.`,
    };
  }

  try {
    await mkdir(projectPath, { recursive: true });
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Failed to create project folder.',
    };
  }

  // Initialise git inside the new folder so the canvas can resolve a real
  // HEAD immediately (otherwise `git rev-parse HEAD` fails and the repo node
  // is stuck in the "loading" skeleton state). Pass user.name/user.email as
  // command-level config so the empty commit works regardless of whether the
  // user has configured global git identity.
  try {
    const cwd = projectPath;
    const opts = IS_WINDOWS ? { cwd, windowsHide: true } : { cwd };
    await execFileAsync('git', ['init', '-b', 'main'], opts);
    await execFileAsync(
      'git',
      [
        '-c',
        'user.name=Shep',
        '-c',
        'user.email=shep@local',
        'commit',
        '--allow-empty',
        '-m',
        'Initial commit',
      ],
      opts
    );
  } catch (err) {
    // Git init failed — the folder still exists, so let the caller continue
    // (the user can still add files manually). Surface the error so it's not
    // silently swallowed in dev.
    // eslint-disable-next-line no-console -- server action: surface git init failures in dev logs
    console.warn('[createProjectFolder] git init failed:', err);
  }

  // Normalise to forward slashes for the rest of the system (CLAUDE.md rule:
  // paths stored / compared / hashed must use forward slashes).
  return { ok: true, path: projectPath.replace(/\\/g, '/') };
}
