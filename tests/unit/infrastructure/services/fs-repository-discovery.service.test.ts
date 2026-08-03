/**
 * FsRepositoryDiscoveryService Unit Tests
 *
 * TDD Phase: RED — written before the adapter exists.
 *
 * Covers the enumeration contract for spec 105 bulk import: immediate children
 * only, git detection per entry, non-directories omitted, and typed failures
 * for unreadable paths.
 */

import 'reflect-metadata';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FsRepositoryDiscoveryService } from '@/infrastructure/services/repositories/fs-repository-discovery.service.js';
import { DirectoryNotReadableError } from '@/application/ports/output/services/repository-discovery-service.interface.js';

describe('FsRepositoryDiscoveryService', () => {
  let root: string;
  let service: FsRepositoryDiscoveryService;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'shep-discovery-'));
    service = new FsRepositoryDiscoveryService();
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('lists immediate subdirectories with absolute paths', async () => {
    mkdirSync(join(root, 'alpha'));
    mkdirSync(join(root, 'beta'));

    const result = await service.listSubdirectories(root);

    expect(result.map((d) => d.name)).toEqual(['alpha', 'beta']);
    expect(result[0].path).toBe(join(root, 'alpha'));
  });

  it('flags directories containing .git as git repositories', async () => {
    mkdirSync(join(root, 'with-git'));
    mkdirSync(join(root, 'with-git', '.git'));
    mkdirSync(join(root, 'without-git'));

    const result = await service.listSubdirectories(root);
    const byName = new Map(result.map((d) => [d.name, d]));

    expect(byName.get('with-git')?.isGitRepository).toBe(true);
    expect(byName.get('without-git')?.isGitRepository).toBe(false);
  });

  it('treats a .git file as a git repository (worktree checkouts)', async () => {
    mkdirSync(join(root, 'worktree-checkout'));
    // git worktrees use a .git FILE pointing at the real gitdir, not a directory
    writeFileSync(join(root, 'worktree-checkout', '.git'), 'gitdir: /elsewhere/.git/worktrees/wt');

    const result = await service.listSubdirectories(root);

    expect(result.find((d) => d.name === 'worktree-checkout')?.isGitRepository).toBe(true);
  });

  it('omits plain files from the results', async () => {
    mkdirSync(join(root, 'a-dir'));
    writeFileSync(join(root, 'notes.txt'), 'hello');

    const result = await service.listSubdirectories(root);

    expect(result.map((d) => d.name)).toEqual(['a-dir']);
  });

  it('does not recurse into nested directories', async () => {
    mkdirSync(join(root, 'outer'));
    mkdirSync(join(root, 'outer', 'inner'));
    mkdirSync(join(root, 'outer', 'inner', '.git'));

    const result = await service.listSubdirectories(root);

    expect(result.map((d) => d.name)).toEqual(['outer']);
  });

  it('returns an empty array for a directory with no children', async () => {
    const result = await service.listSubdirectories(root);

    expect(result).toEqual([]);
  });

  it('throws DirectoryNotReadableError when the path does not exist', async () => {
    await expect(service.listSubdirectories(join(root, 'missing'))).rejects.toThrow(
      DirectoryNotReadableError
    );
  });

  it('throws DirectoryNotReadableError when the path is a file', async () => {
    const filePath = join(root, 'a-file.txt');
    writeFileSync(filePath, 'content');

    await expect(service.listSubdirectories(filePath)).rejects.toThrow(DirectoryNotReadableError);
  });

  it('includes hidden directories so dotfile-named checkouts are importable', async () => {
    mkdirSync(join(root, '.hidden-project'));

    const result = await service.listSubdirectories(root);

    expect(result.map((d) => d.name)).toEqual(['.hidden-project']);
  });
});
