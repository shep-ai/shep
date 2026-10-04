/** Row ⇄ entity conversion for feedback keys (spec 127). */

import type { FeedbackKey } from '../../../../domain/generated/output.js';
import { defined, millis, optionalMillis } from './row-values.js';

export interface FeedbackKeyRow {
  id: string;
  space_id: string;
  name: string;
  prefix: string;
  key_hash: string;
  last_used_at: number | null;
  revoked_at: number | null;
  created_at: number;
  updated_at: number;
}

export function feedbackKeyToDatabase(key: FeedbackKey): FeedbackKeyRow {
  return {
    id: key.id,
    space_id: key.spaceId,
    name: key.name,
    prefix: key.prefix,
    key_hash: key.keyHash,
    last_used_at: optionalMillis(key.lastUsedAt),
    revoked_at: optionalMillis(key.revokedAt),
    created_at: millis(key.createdAt),
    updated_at: millis(key.updatedAt),
  };
}

export function feedbackKeyFromDatabase(row: FeedbackKeyRow): FeedbackKey {
  return {
    id: row.id,
    spaceId: row.space_id,
    name: row.name,
    prefix: row.prefix,
    keyHash: row.key_hash,
    ...defined({
      lastUsedAt: row.last_used_at === null ? null : new Date(row.last_used_at),
      revokedAt: row.revoked_at === null ? null : new Date(row.revoked_at),
    }),
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}
