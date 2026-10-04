/** Shared setup for the feedback use-case tests (spec 127). */

import type { FeedbackKey } from '@/domain/generated/output.js';
import type { IFeedbackKeyRepository } from '@/application/ports/output/repositories/feedback-key-repository.interface.js';
import type { IFeedbackKeyGenerator } from '@/application/ports/output/services/feedback-key-generator.interface.js';
import { ManageSignalsUseCase } from '@/application/use-cases/opportunities/manage-signals.use-case.js';
import { ManageOpportunitiesUseCase } from '@/application/use-cases/opportunities/manage-opportunities.use-case.js';
import { opportunityWorld } from '../opportunities/opportunity.fixtures.js';

export class InMemoryFeedbackKeys implements IFeedbackKeyRepository {
  readonly rows = new Map<string, FeedbackKey>();
  async list(spaceId?: string) {
    return [...this.rows.values()].filter((k) => spaceId === undefined || k.spaceId === spaceId);
  }
  async findById(id: string) {
    return this.rows.get(id) ?? null;
  }
  async findByHash(keyHash: string) {
    return [...this.rows.values()].find((k) => k.keyHash === keyHash) ?? null;
  }
  async create(key: FeedbackKey) {
    this.rows.set(key.id, key);
  }
  async update(key: FeedbackKey) {
    this.rows.set(key.id, key);
  }
}

/** Keys are "secret-N"; a hash is the secret reversed. */
export class FakeKeyGenerator implements IFeedbackKeyGenerator {
  private next = 0;
  generate() {
    this.next += 1;
    const secret = `shep_fb_secret-${this.next}`;
    return { secret, prefix: secret.slice(0, 10), hash: this.hash(secret) };
  }
  hash(secret: string) {
    return [...secret].reverse().join('');
  }
}

export function feedbackWorld() {
  const world = opportunityWorld();
  const signals = new ManageSignalsUseCase(
    world.signals,
    world.opportunities,
    world.spaces,
    world.productLines
  );
  const opportunities = new ManageOpportunitiesUseCase(
    world.opportunities,
    world.signals,
    world.weights,
    world.spaces,
    world.productLines
  );
  return {
    ...world,
    keys: new InMemoryFeedbackKeys(),
    generator: new FakeKeyGenerator(),
    manageSignals: signals,
    manageOpportunities: opportunities,
  };
}
