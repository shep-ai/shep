/**
 * Feature lookup for the console use cases (specs 142, 143): the full id, or
 * the short id prefix the console shows.
 */

import type { Feature } from '../../../domain/generated/output.js';
import type { IFeatureRepository } from '../../ports/output/repositories/feature-repository.interface.js';

export async function findFeatureByIdOrPrefix(
  repo: Pick<IFeatureRepository, 'findById' | 'findByIdPrefix'>,
  idOrPrefix: string
): Promise<Feature | null> {
  return (await repo.findById(idOrPrefix)) ?? (await repo.findByIdPrefix(idOrPrefix));
}
