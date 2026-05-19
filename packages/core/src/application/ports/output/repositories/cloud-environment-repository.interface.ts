/**
 * CloudEnvironment Repository Interface (Output Port)
 *
 * Feature 098, phase 2. Persistence contract for the CloudEnvironment
 * entity — a deployment target / cloud account / cloud project linked to
 * an Application.
 */

import type { CloudEnvironment } from '../../../../domain/generated/output.js';

export interface ICloudEnvironmentRepository {
  /** Insert a new cloud environment. */
  create(env: CloudEnvironment): Promise<void>;

  /** Find a cloud environment by id (excludes soft-deleted). */
  findById(id: string): Promise<CloudEnvironment | null>;

  /** List every non-deleted cloud environment for the given application. */
  findByApplicationId(applicationId: string): Promise<CloudEnvironment[]>;

  /** List every non-deleted cloud environment across all applications. */
  listAll(): Promise<CloudEnvironment[]>;

  /** Update mutable cloud environment fields by id. */
  update(
    id: string,
    fields: Partial<
      Pick<CloudEnvironment, 'name' | 'provider' | 'accountId' | 'ownerId' | 'region'>
    >
  ): Promise<void>;

  /** Soft-delete the cloud environment. */
  softDelete(id: string): Promise<void>;
}
