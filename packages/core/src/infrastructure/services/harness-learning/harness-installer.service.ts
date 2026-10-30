/**
 * HarnessInstallerService (spec 150) — writes a learned-harness version into a
 * worktree for the agent about to run.
 *
 * The agent family comes from the agent catalog; WHERE each component goes is
 * decided by the pure `planHarnessInstall`. This service only touches disk:
 * it removes what the previous install wrote (tracked in a manifest), writes
 * the plan, and makes sure git ignores every installed path — agents commit
 * with their own `git add`, so unstaging in Shep's commit service alone would
 * not be enough.
 */

import { mkdir, readFile, rm, rmdir, writeFile, appendFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { inject, injectable } from 'tsyringe';

import type {
  HarnessInstallation,
  HarnessInstallRequest,
  IHarnessInstaller,
} from '../../../application/ports/output/services/harness-installer.interface.js';
import { HarnessSurfaceFamily } from '../../../domain/generated/output.js';
import { AGENT_CATALOG } from '../../../domain/shared/agent-catalog.js';
import {
  INSTALL_EXCLUDE_PATTERNS,
  planHarnessInstall,
} from '../../../domain/harness-learning/harness-install-plan.js';
import { LEARNED_DIR } from '../../../domain/harness-learning/harness-surfaces.js';
import { treeFromComponents } from '../../../domain/harness-learning/harness-tree.js';
import type { ExecFunction } from '../git/worktree.service.js';

const MANIFEST = `${LEARNED_DIR}/manifest.json`;
const SETTINGS = `${LEARNED_DIR}/settings.json`;
const EXCLUDE_MARKER = '# shep: learned harness (spec 150)';

interface Manifest {
  versionId?: string;
  paths: string[];
}

@injectable()
export class HarnessInstallerService implements IHarnessInstaller {
  constructor(@inject('ExecFunction') private readonly exec: ExecFunction) {}

  async install(request: HarnessInstallRequest): Promise<HarnessInstallation> {
    const root = request.worktreePath;
    await this.removePrevious(root);
    const version = request.version;
    if (!version || version.components.length === 0) return { writtenPaths: [], warnings: [] };

    const family =
      AGENT_CATALOG[request.agentType]?.harnessSurface ?? HarnessSurfaceFamily.PromptSection;
    const plan = planHarnessInstall(treeFromComponents(version.components), family);
    const warnings = [...plan.warnings];
    if (!(await this.ensureGitExcluded(root))) {
      warnings.push('could not add the learned harness to .git/info/exclude');
    }

    const written: string[] = [];
    const files = {
      ...plan.files,
      ...(plan.hooksSettings ? { [SETTINGS]: plan.hooksSettings } : {}),
    };
    for (const [path, content] of Object.entries(files)) {
      const target = join(root, path);
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, content, 'utf8');
      written.push(path);
    }
    const manifest: Manifest = { versionId: version.id, paths: written };
    await mkdir(join(root, LEARNED_DIR), { recursive: true });
    await writeFile(join(root, MANIFEST), JSON.stringify(manifest, null, 2), 'utf8');

    return {
      versionId: version.id,
      ...(plan.systemPrompt && { systemPrompt: plan.systemPrompt }),
      ...(plan.promptSection && { promptSection: plan.promptSection }),
      ...(plan.hooksSettings && { settingsPath: join(root, SETTINGS) }),
      writtenPaths: written,
      warnings,
    };
  }

  /** Delete every file the last install listed, then the directories it left empty. */
  private async removePrevious(root: string): Promise<void> {
    let manifest: Manifest;
    try {
      manifest = JSON.parse(await readFile(join(root, MANIFEST), 'utf8')) as Manifest;
    } catch {
      return;
    }
    for (const path of manifest.paths ?? []) {
      const target = resolve(root, path);
      if (!target.startsWith(resolve(root))) continue;
      await rm(target, { force: true });
      await this.removeEmptyParents(root, dirname(target));
    }
    await rm(join(root, LEARNED_DIR), { recursive: true, force: true });
  }

  private async removeEmptyParents(root: string, dir: string): Promise<void> {
    const stop = resolve(root);
    let current = resolve(dir);
    while (current.startsWith(stop) && current !== stop) {
      try {
        await rmdir(current);
      } catch {
        return;
      }
      current = dirname(current);
    }
  }

  /** Append the install patterns to the repository's info/exclude once. */
  private async ensureGitExcluded(root: string): Promise<boolean> {
    try {
      const { stdout } = await this.exec('git', ['rev-parse', '--git-common-dir'], { cwd: root });
      const common = stdout.trim();
      const gitDir = isAbsolute(common) ? common : join(root, common);
      const excludePath = join(gitDir, 'info', 'exclude');
      let existing = '';
      try {
        existing = await readFile(excludePath, 'utf8');
      } catch {
        await mkdir(dirname(excludePath), { recursive: true });
      }
      if (existing.includes(EXCLUDE_MARKER)) return true;
      const block = [EXCLUDE_MARKER, ...INSTALL_EXCLUDE_PATTERNS].join('\n');
      const prefix = existing && !existing.endsWith('\n') ? '\n' : '';
      await appendFile(excludePath, `${prefix}${block}\n`, 'utf8');
      return true;
    } catch {
      return false;
    }
  }
}
