/** Feedback key repository (output port) — spec 127. */

import type { FeedbackKey } from '../../../../domain/generated/output.js';

export interface IFeedbackKeyRepository {
  /** Oldest first; every space when `spaceId` is omitted. */
  list(spaceId?: string): Promise<FeedbackKey[]>;
  findById(id: string): Promise<FeedbackKey | null>;
  findByHash(keyHash: string): Promise<FeedbackKey | null>;
  create(key: FeedbackKey): Promise<void>;
  update(key: FeedbackKey): Promise<void>;
}
