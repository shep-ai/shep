/**
 * Feature lookup shared by the checkpoint use cases: the CLI accepts an id
 * prefix, the web passes full ids.
 */

import type { Feature } from '../../../../domain/generated/output.js';
import type { IFeatureRepository } from '../../../ports/output/repositories/feature-repository.interface.js';

export async function findFeatureOrThrow(
  features: IFeatureRepository,
  featureId: string
): Promise<Feature> {
  const feature =
    (await features.findById(featureId)) ?? (await features.findByIdPrefix(featureId));
  if (!feature) throw new Error(`Feature not found: "${featureId}"`);
  return feature;
}
