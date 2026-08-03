/**
 * FsRepositoryDiscoveryService
 *
 * Concrete adapter for IRepositoryDiscoveryService backed by node:fs/promises.
 *
 * Enumerates the immediate children of a directory and reports which ones look
 * like git repositories. Uses `withFileTypes` so the directory check needs no
 * extra stat call, then one existence probe per child for `.git`.
 */

import { readdir, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { injectable } from 'tsyringe';

import type {
  DiscoveredDirectory,
  IRepositoryDiscoveryService,
} from '../../../application/ports/output/services/repository-discovery-service.interface.js';
import { DirectoryNotReadableError } from '../../../application/ports/output/services/repository-discovery-service.interface.js';

@injectable()
export class FsRepositoryDiscoveryService implements IRepositoryDiscoveryService {
  async listSubdirectories(directoryPath: string): Promise<DiscoveredDirectory[]> {
    await this.assertReadableDirectory(directoryPath);

    let entries;
    try {
      entries = await readdir(directoryPath, { withFileTypes: true, encoding: 'utf-8' });
    } catch (error) {
      throw new DirectoryNotReadableError(directoryPath, this.describe(error));
    }

    // Symlinked directories are included — a symlinked checkout is still a
    // repository worth tracking — so resolve those with an explicit stat.
    const candidates = await Promise.all(
      entries.map(async (entry) => {
        if (entry.isDirectory()) return entry.name;
        if (entry.isSymbolicLink()) {
          try {
            const target = await stat(join(directoryPath, entry.name));
            return target.isDirectory() ? entry.name : null;
          } catch {
            // Broken symlink — not importable.
            return null;
          }
        }
        return null;
      })
    );

    return candidates
      .filter((name): name is string => name !== null)
      .sort((a, b) => a.localeCompare(b))
      .map((name) => this.toDiscoveredDirectory(directoryPath, name));
  }

  private toDiscoveredDirectory(parentPath: string, name: string): DiscoveredDirectory {
    const path = join(parentPath, name);
    return {
      name,
      path,
      // A git worktree checkout has a .git FILE rather than a directory, so
      // test for existence of either rather than for a directory specifically.
      isGitRepository: existsSync(join(path, '.git')),
    };
  }

  private async assertReadableDirectory(directoryPath: string): Promise<void> {
    let info;
    try {
      info = await stat(directoryPath);
    } catch (error) {
      throw new DirectoryNotReadableError(directoryPath, this.describe(error));
    }

    if (!info.isDirectory()) {
      throw new DirectoryNotReadableError(directoryPath, 'path is not a directory');
    }
  }

  private describe(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
