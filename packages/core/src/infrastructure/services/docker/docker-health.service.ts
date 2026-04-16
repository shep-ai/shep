/**
 * Docker Health Service
 *
 * Infrastructure implementation of IDockerHealthService.
 * Checks Docker daemon availability by running `docker info` via execFile.
 */

import { injectable, inject } from 'tsyringe';
import type { IDockerHealthService } from '../../../application/ports/output/services/docker-health-service.interface.js';
import type { ExecFunction } from '../git/worktree.service.js';

@injectable()
export class DockerHealthService implements IDockerHealthService {
  constructor(@inject('ExecFunction') private readonly execFile: ExecFunction) {}

  async isAvailable(): Promise<boolean> {
    try {
      await this.execFile('docker', ['info']);
      return true;
    } catch {
      return false;
    }
  }
}
