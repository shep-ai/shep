/**
 * Application Repository Interface (Output Port)
 *
 * Defines the contract for Application entity persistence operations.
 */

import type { Application, ApplicationStatus } from '../../../../domain/generated/output.js';

/** Guard for a status write: the statuses the row may leave. */
export interface ApplicationStatusUpdateOptions {
  /** Apply the write only while the application is in one of these statuses. */
  allowedFrom: readonly ApplicationStatus[];
}

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
  /**
   * Guarded status write. Moves the application to `status` ONLY while it is
   * still in one of `options.allowedFrom`, in a single conditional UPDATE, and
   * returns whether it did. The returned boolean is the claim: of two callers
   * racing to leave the same status (two "Try again" clicks), exactly one gets
   * `true`, and only that one may start work.
   */
  updateStatus(
    id: string,
    status: ApplicationStatus,
    options: ApplicationStatusUpdateOptions
  ): Promise<boolean>;
  softDelete(id: string): Promise<void>;
  restore(id: string): Promise<void>;
}
