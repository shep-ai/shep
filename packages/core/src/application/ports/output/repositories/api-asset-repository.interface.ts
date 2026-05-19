/**
 * ApiAsset Repository Interface (Output Port)
 *
 * Feature 098, phase 2. Persistence contract for the ApiAsset entity —
 * an external- or internal-facing API surface attached to an Application.
 */

import type { ApiAsset } from '../../../../domain/generated/output.js';

export interface IApiAssetRepository {
  /** Insert a new api asset. */
  create(asset: ApiAsset): Promise<void>;

  /** Find an api asset by id (excludes soft-deleted). */
  findById(id: string): Promise<ApiAsset | null>;

  /** List every non-deleted api asset for the given application. */
  findByApplicationId(applicationId: string): Promise<ApiAsset[]>;

  /** List every non-deleted api asset across all applications. */
  listAll(): Promise<ApiAsset[]>;

  /** Update mutable api asset fields by id. */
  update(
    id: string,
    fields: Partial<Pick<ApiAsset, 'name' | 'baseUrl' | 'ownerId' | 'exposure' | 'schemaPath'>>
  ): Promise<void>;

  /** Soft-delete the api asset. */
  softDelete(id: string): Promise<void>;
}
