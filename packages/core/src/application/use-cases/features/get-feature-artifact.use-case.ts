/**
 * Get Feature Artifact Use Case
 *
 * Retrieves the parsed FeatureArtifact (PRD) for a given feature by
 * reading and parsing the spec.yaml from the feature's spec directory.
 *
 * Business Rules:
 * - Throws if the feature does not exist
 * - Throws if the feature has no specPath
 * - Throws if spec.yaml cannot be read or parsed
 */

import { injectable, inject } from 'tsyringe';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { FeatureArtifact } from '../../../domain/generated/output.js';
import type { ISpecArtifactParser } from '../../ports/output/services/spec-artifact-parser.interface.js';
import type { IFeatureRepository } from '../../ports/output/repositories/feature-repository.interface.js';

@injectable()
export class GetFeatureArtifactUseCase {
  constructor(
    @inject('IFeatureRepository')
    private readonly featureRepo: IFeatureRepository,
    @inject('ISpecArtifactParser')
    private readonly specParser: ISpecArtifactParser
  ) {}

  async execute(featureId: string): Promise<FeatureArtifact> {
    const feature =
      (await this.featureRepo.findById(featureId)) ??
      (await this.featureRepo.findByIdPrefix(featureId));
    if (!feature) {
      throw new Error(`Feature not found: "${featureId}"`);
    }

    if (!feature.specPath) {
      throw new Error(`Feature "${featureId}" has no spec path`);
    }

    const specYamlPath = join(feature.specPath, 'spec.yaml');
    const content = await readFile(specYamlPath, 'utf-8');
    return this.specParser.parseSpecYaml(content);
  }
}
