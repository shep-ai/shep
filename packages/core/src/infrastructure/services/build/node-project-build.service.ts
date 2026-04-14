import { injectable } from 'tsyringe';
import { spawn, execFileSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { IS_WINDOWS } from '../../platform.js';
import type { IProjectBuildService } from '../../../application/ports/output/services/project-build-service.interface.js';

const LOCKFILE_MANAGERS = [
  { lockfile: 'bun.lock', manager: 'bun' },
  { lockfile: 'bun.lockb', manager: 'bun' },
  { lockfile: 'pnpm-lock.yaml', manager: 'pnpm' },
  { lockfile: 'yarn.lock', manager: 'yarn' },
  { lockfile: 'package-lock.json', manager: 'npm' },
] as const;

function detectPackageManager(dir: string): string {
  for (const { lockfile, manager } of LOCKFILE_MANAGERS) {
    if (existsSync(join(dir, lockfile))) return manager;
  }
  return 'npm';
}

@injectable()
export class NodeProjectBuildService implements IProjectBuildService {
  async buildProject(repositoryPath: string, onLog: (line: string) => void): Promise<void> {
    let packageJson: { scripts?: Record<string, string> };
    try {
      packageJson = JSON.parse(readFileSync(join(repositoryPath, 'package.json'), 'utf-8'));
    } catch {
      throw new Error(`No package.json found in ${repositoryPath}`);
    }

    if (!packageJson.scripts?.['build']) {
      throw new Error(`No "build" script found in package.json at ${repositoryPath}`);
    }

    const packageManager = detectPackageManager(repositoryPath);

    // Install deps if node_modules is absent (e.g. fresh clone)
    if (!existsSync(join(repositoryPath, 'node_modules'))) {
      onLog(`Installing dependencies with ${packageManager}…`);
      try {
        execFileSync(packageManager, ['install'], {
          cwd: repositoryPath,
          shell: true,
          stdio: 'ignore',
          ...(IS_WINDOWS ? { windowsHide: true } : {}),
        });
      } catch (err) {
        throw new Error(`Dependency install failed: ${err}`);
      }
    }

    // bun/npm need explicit "run"; pnpm/yarn accept the script name directly
    const args =
      packageManager === 'npm' || packageManager === 'bun' ? ['run', 'build'] : ['build'];

    onLog(`Running ${packageManager} ${args.join(' ')}…`);

    await new Promise<void>((resolve, reject) => {
      const child = spawn(packageManager, args, {
        cwd: repositoryPath,
        shell: true,
        stdio: ['ignore', 'pipe', 'pipe'],
        ...(IS_WINDOWS ? { windowsHide: true } : {}),
        env: { ...process.env, SHEP_SKIP_RECOVERY: '1' },
      });

      const handleData = (data: Buffer) => {
        for (const line of data.toString().split('\n')) {
          const trimmed = line.trimEnd();
          if (trimmed) onLog(trimmed);
        }
      };

      child.stdout?.on('data', handleData);
      child.stderr?.on('data', handleData);
      child.on('close', (code) => {
        if (code === 0) resolve();
        else reject(new Error(`Build exited with code ${code}`));
      });
      child.on('error', reject);
    });
  }
}
