/**
 * Application Repository Interface (Output Port)
 *
 * Defines the contract for Application entity persistence operations.
 */

import type { Application } from '../../../../domain/generated/output.js';

export interface IApplicationRepository {
  create(application: Application): Promise<void>;
  findById(id: string): Promise<Application | null>;
  findBySlug(slug: string): Promise<Application | null>;
  findByPath(path: string): Promise<Application | null>;
  list(): Promise<Application[]>;
  update(
    id: string,
    fields: Partial<
      Pick<
        Application,
        | 'name'
        | 'status'
        | 'additionalPaths'
        | 'agentType'
        | 'modelOverride'
        | 'setupComplete'
        | 'agentSessionId'
        | 'gitRemoteUrl'
        | 'cloudDeploymentProvider'
        | 'cloudDeploymentStatus'
        | 'cloudDeploymentId'
        | 'cloudDeploymentUrl'
        | 'cloudDeploymentError'
        | 'lastDeployedAt'
        | 'scannerProfile'
        | 'lastScannedAt'
        | 'bedrockEnabled'
      >
    >
  ): Promise<void>;
  softDelete(id: string): Promise<void>;
  restore(id: string): Promise<void>;
}
