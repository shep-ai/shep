/**
 * Filesystem Project Scaffold Service
 *
 * Concrete adapter for IProjectScaffoldService. Owns "where projects live"
 * ($SHEP_HOME/projects) and how they are bootstrapped: mkdir + git init +
 * empty initial commit so the canvas can resolve a real HEAD immediately.
 *
 * Cross-platform: uses path.join (no hardcoded separators), windowsHide on
 * spawned processes, and normalizes the returned path to forward slashes.
 */

import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';

import { injectable } from 'tsyringe';

import type {
  IProjectScaffoldService,
  ScaffoldProjectInput,
  ScaffoldProjectResult,
} from '../../../application/ports/output/services/project-scaffold-service.interface.js';
import { IS_WINDOWS } from '../../platform.js';
import { getShepHomeDir } from '../filesystem/shep-directory.service.js';

const execFileAsync = promisify(execFile);

@injectable()
export class FsProjectScaffoldService implements IProjectScaffoldService {
  /**
   * Resolve the projects root lazily so test isolation via SHEP_HOME works
   * even when this adapter is constructed before the env var is set.
   */
  private getProjectsRoot(): string {
    return join(getShepHomeDir(), 'projects');
  }

  private getProjectPath(slug: string): string {
    return join(this.getProjectsRoot(), slug);
  }

  async projectExists(slug: string): Promise<boolean> {
    return existsSync(this.getProjectPath(slug));
  }

  async scaffoldProject(input: ScaffoldProjectInput): Promise<ScaffoldProjectResult> {
    const projectPath = this.getProjectPath(input.slug);

    await mkdir(projectPath, { recursive: true });

    // Initialise git so the canvas can resolve a real HEAD immediately
    // (otherwise `git rev-parse HEAD` fails and the repo node is stuck in
    // the "loading" skeleton state). Pass user.name/user.email as command-
    // level config so the empty commit works regardless of whether the user
    // has configured global git identity. Tolerate failures: the folder
    // still exists, so the caller can continue.
    try {
      const opts = IS_WINDOWS ? { cwd: projectPath, windowsHide: true } : { cwd: projectPath };
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
      // eslint-disable-next-line no-console -- adapter: surface git init failures in dev logs
      console.warn('[FsProjectScaffoldService] git init failed:', err);
    }

    // Normalise to forward slashes per the cross-platform path rule.
    return { path: projectPath.replace(/\\/g, '/') };
  }
}
