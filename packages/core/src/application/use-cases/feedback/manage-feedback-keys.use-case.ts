/**
 * ManageFeedbackKeysUseCase (spec 127)
 *
 * Issues, lists and revokes the keys tools use to post feedback into a space.
 * A new key's secret is returned once; only its hash and prefix are kept.
 */

import { randomUUID } from 'node:crypto';
import { injectable, inject } from 'tsyringe';
import type { FeedbackKey } from '../../../domain/generated/output.js';
import type { ISpaceRepository } from '../../ports/output/repositories/space-repository.interface.js';
import type { IProductLineRepository } from '../../ports/output/repositories/product-line-repository.interface.js';
import type { IFeedbackKeyRepository } from '../../ports/output/repositories/feedback-key-repository.interface.js';
import type { IFeedbackKeyGenerator } from '../../ports/output/services/feedback-key-generator.interface.js';
import {
  failure,
  resolveScope,
  type OpportunityResult,
} from '../opportunities/opportunity-scope.js';

/** A key as people see it: never its hash. */
export type FeedbackKeyView = Omit<FeedbackKey, 'keyHash'>;

export const MAX_KEY_NAME_LENGTH = 80;

export function feedbackKeyView(key: FeedbackKey): FeedbackKeyView {
  const { keyHash: _hidden, ...view } = key;
  return view;
}

@injectable()
export class ManageFeedbackKeysUseCase {
  constructor(
    @inject('IFeedbackKeyRepository') private readonly keys: IFeedbackKeyRepository,
    @inject('IFeedbackKeyGenerator') private readonly generator: IFeedbackKeyGenerator,
    @inject('ISpaceRepository') private readonly spaces: ISpaceRepository,
    @inject('IProductLineRepository') private readonly productLines: IProductLineRepository
  ) {}

  async create(input: {
    space?: string;
    name: string;
  }): Promise<OpportunityResult<{ key: FeedbackKeyView; secret: string }>> {
    const name = input.name.trim();
    if (!name || name.length > MAX_KEY_NAME_LENGTH) {
      return failure(`A feedback key needs a name of 1 to ${MAX_KEY_NAME_LENGTH} characters.`);
    }
    const scope = await resolveScope(this.spaces, this.productLines, input);
    if (!scope.ok) return scope;
    const generated = this.generator.generate();
    const now = new Date();
    const key: FeedbackKey = {
      id: randomUUID(),
      spaceId: scope.space.id,
      name,
      prefix: generated.prefix,
      keyHash: generated.hash,
      createdAt: now,
      updatedAt: now,
    };
    await this.keys.create(key);
    return { ok: true, key: feedbackKeyView(key), secret: generated.secret };
  }

  async list(space?: string): Promise<OpportunityResult<{ keys: FeedbackKeyView[] }>> {
    if (!space?.trim()) return { ok: true, keys: (await this.keys.list()).map(feedbackKeyView) };
    const scope = await resolveScope(this.spaces, this.productLines, { space });
    if (!scope.ok) return scope;
    return { ok: true, keys: (await this.keys.list(scope.space.id)).map(feedbackKeyView) };
  }

  async revoke(id: string): Promise<OpportunityResult<{ key: FeedbackKeyView }>> {
    const key = await this.keys.findById(id.trim());
    if (!key) return failure(`No feedback key "${id}".`);
    if (key.revokedAt) return { ok: true, key: feedbackKeyView(key) };
    const now = new Date();
    const revoked = { ...key, revokedAt: now, updatedAt: now };
    await this.keys.update(revoked);
    return { ok: true, key: feedbackKeyView(revoked) };
  }
}
