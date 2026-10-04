/** Random feedback keys and their SHA-256 hashes (spec 127). */

import { createHash, randomBytes } from 'node:crypto';
import type {
  GeneratedFeedbackKey,
  IFeedbackKeyGenerator,
} from '../../../application/ports/output/services/feedback-key-generator.interface.js';

export const FEEDBACK_KEY_PREFIX = 'shep_fb_';
const KEY_BYTES = 24;
const VISIBLE_CHARS = 12;

export class FeedbackKeyGenerator implements IFeedbackKeyGenerator {
  generate(): GeneratedFeedbackKey {
    const secret = `${FEEDBACK_KEY_PREFIX}${randomBytes(KEY_BYTES).toString('base64url')}`;
    return { secret, prefix: secret.slice(0, VISIBLE_CHARS), hash: this.hash(secret) };
  }

  hash(secret: string): string {
    return createHash('sha256').update(secret, 'utf8').digest('hex');
  }
}
