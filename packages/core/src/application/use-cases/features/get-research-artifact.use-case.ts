/**
 * Get Research Artifact Use Case
 *
 * Retrieves the parsed ResearchArtifact for a given feature by
 * reading and parsing the research.yaml from the feature's spec directory.
 *
 * Business Rules:
 * - Throws if the feature does not exist
 * - Throws if the feature has no specPath
 * - Throws if research.yaml cannot be read or parsed
 */

import { injectable, inject } from 'tsyringe';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { ResearchArtifact } from '../../../domain/generated/output.js';
import type { ISpecArtifactParser } from '../../ports/output/services/spec-artifact-parser.interface.js';
import type { IFeatureRepository } from '../../ports/output/repositories/feature-repository.interface.js';

@injectable()
export class GetResearchArtifactUseCase {
  constructor(
    @inject('IFeatureRepository')
    private readonly featureRepo: IFeatureRepository,
    @inject('ISpecArtifactParser')
    private readonly specParser: ISpecArtifactParser
  ) {}

  async execute(featureId: string): Promise<ResearchArtifact> {
    const feature =
      (await this.featureRepo.findById(featureId)) ??
      (await this.featureRepo.findByIdPrefix(featureId));
    if (!feature) {
      throw new Error(`Feature not found: "${featureId}"`);
    }

    if (!feature.specPath) {
      throw new Error(`Feature "${featureId}" has no spec path`);
    }

    const researchYamlPath = join(feature.specPath, 'research.yaml');
    const content = await readFile(researchYamlPath, 'utf-8');
    return this.specParser.parseResearchYaml(content);
  }
}
