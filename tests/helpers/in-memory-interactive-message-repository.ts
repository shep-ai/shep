/**
 * In-memory IInteractiveMessageRepository for use-case tests (spec 137).
 *
 * Behaves like the SQLite repository: messages are kept per scope in
 * created_at order, and `findByFeatureIdSince` is strictly-after.
 */

import type { IInteractiveMessageRepository } from '@/application/ports/output/repositories/interactive-message-repository.interface.js';
import type { InteractiveMessage } from '@/domain/generated/output.js';

export class InMemoryInteractiveMessageRepository implements IInteractiveMessageRepository {
  readonly messages: InteractiveMessage[] = [];

  async create(message: InteractiveMessage): Promise<void> {
    this.messages.push(message);
  }

  private ordered(featureId: string): InteractiveMessage[] {
    return this.messages
      .filter((m) => m.featureId === featureId)
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  }

  async findByFeatureId(featureId: string, limit = 200): Promise<InteractiveMessage[]> {
    return this.ordered(featureId).slice(0, limit);
  }

  async findByFeatureIdSince(featureId: string, since: Date): Promise<InteractiveMessage[]> {
    return this.ordered(featureId).filter((m) => new Date(m.createdAt).getTime() > since.getTime());
  }

  async findBySessionId(sessionId: string): Promise<InteractiveMessage[]> {
    return this.messages.filter((m) => m.sessionId === sessionId);
  }

  async deleteByFeatureId(featureId: string): Promise<void> {
    for (let i = this.messages.length - 1; i >= 0; i -= 1) {
      if (this.messages[i].featureId === featureId) this.messages.splice(i, 1);
    }
  }
}
