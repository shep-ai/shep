/**
 * File System Service Implementation
 *
 * Concrete adapter for IFileSystemService backed by node:fs/promises.
 */

import { existsSync } from 'node:fs';
import { readFile, rm, writeFile } from 'node:fs/promises';
import { injectable } from 'tsyringe';

import type { IFileSystemService } from '../../application/ports/output/services/file-system-service.interface.js';

@injectable()
export class FileSystemService implements IFileSystemService {
  async readTextFile(filePath: string): Promise<string> {
    return readFile(filePath, 'utf8');
  }

  async writeTextFile(filePath: string, contents: string): Promise<void> {
    await writeFile(filePath, contents, 'utf8');
  }

  async removeDirectory(dirPath: string): Promise<void> {
    await rm(dirPath, { recursive: true, force: true });
  }

  pathExists(path: string): boolean {
    return existsSync(path);
  }
}
