/**
 * AdoptHarnessVersionUseCase (spec 150)
 *
 * Makes a version the scope's current learned harness (the previous one
 * becomes Superseded in the same transaction), records its `memory.md` facts
 * as Shep Brain project memory, and closes any open inbox question about it.
 * A person may adopt any version; the automatic path is decided by
 * OfferHarnessCandidateUseCase, which never auto-adopts scripts or hooks.
 */

import { createHash } from 'node:crypto';
import { inject, injectable } from 'tsyringe';
import { LearnedHarnessStatus, MemoryCategory } from '../../../domain/generated/output.js';
import { memoryFacts } from '../../../domain/harness-learning/harness-decision.js';
import { MEMORY_PATH } from '../../../domain/harness-learning/harness-surfaces.js';
import type { ILearnedHarnessRepository } from '../../ports/output/repositories/learned-harness-repository.interface.js';
import { RecordProjectMemoryUseCase } from '../project-memory/record-project-memory.use-case.js';
import { HarnessDecisionSettler } from './harness-decision-settler.js';

const MEMORY_KEY_PREFIX = 'learned-';
const MEMORY_KEY_HASH_CHARS = 12;

export interface AdoptHarnessVersionInput {
  versionId: string;
  /** Who adopted it, e.g. `user:cli`, `user:web`, `policy`. */
  actor: string;
}

export interface AdoptHarnessVersionResult {
  adopted: boolean;
  reason?: string;
  memoryFactsRecorded: number;
}

@injectable()
export class AdoptHarnessVersionUseCase {
  constructor(
    @inject('ILearnedHarnessRepository') private readonly harnesses: ILearnedHarnessRepository,
    @inject(RecordProjectMemoryUseCase) private readonly recordMemory: RecordProjectMemoryUseCase,
    @inject(HarnessDecisionSettler) private readonly settler: HarnessDecisionSettler
  ) {}

  async execute(input: AdoptHarnessVersionInput): Promise<AdoptHarnessVersionResult> {
    const version = await this.harnesses.findVersion(input.versionId);
    if (!version) return { adopted: false, reason: 'version not found', memoryFactsRecorded: 0 };
    if (version.status === LearnedHarnessStatus.Adopted) {
      return { adopted: true, reason: 'already adopted', memoryFactsRecorded: 0 };
    }
    await this.harnesses.adopt(version.id);

    const facts = memoryFacts(version.components.find((c) => c.path === MEMORY_PATH)?.content);
    const { recorded } = facts.length
      ? await this.recordMemory.execute({
          repositoryPath: version.repositoryPath,
          ...(version.sourceFeatureId ? { sourceFeatureId: version.sourceFeatureId } : {}),
          entries: facts.map((fact) => ({
            category: MemoryCategory.Convention,
            entryKey: `${MEMORY_KEY_PREFIX}${createHash('sha256').update(fact).digest('hex').slice(0, MEMORY_KEY_HASH_CHARS)}`,
            content: fact,
          })),
        })
      : { recorded: 0 };

    await this.settler.settle(version, 'Adopted', input.actor);
    return { adopted: true, memoryFactsRecorded: recorded };
  }
}
