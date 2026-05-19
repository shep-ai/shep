/**
 * Service Repository Interface (Output Port)
 *
 * Feature 098, phase 2. Persistence contract for the Service entity —
 * an adjacent asset attached to an Application.
 */

import type { Service } from '../../../../domain/generated/output.js';

export interface IServiceRepository {
  /** Insert a new service. */
  create(service: Service): Promise<void>;

  /** Find a service by id (excludes soft-deleted). */
  findById(id: string): Promise<Service | null>;

  /** List every non-deleted service for the given application. */
  findByApplicationId(applicationId: string): Promise<Service[]>;

  /** List every non-deleted service across all applications. */
  listAll(): Promise<Service[]>;

  /** Update mutable service fields by id. */
  update(
    id: string,
    fields: Partial<Pick<Service, 'name' | 'slug' | 'ownerId' | 'exposure'>>
  ): Promise<void>;

  /** Soft-delete the service. */
  softDelete(id: string): Promise<void>;
}
