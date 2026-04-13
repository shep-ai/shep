/**
 * PmSession Repository Interface (Output Port)
 *
 * Defines the contract for PmSession entity persistence operations.
 * Sessions represent authenticated user sessions with tokens and expiry.
 */

import type { PmSession } from '../../../../domain/generated/output.js';

export interface IPmSessionRepository {
  create(session: PmSession): Promise<void>;
  findByToken(token: string): Promise<PmSession | null>;
  findValidByToken(token: string): Promise<PmSession | null>;
  listByUser(userId: string): Promise<PmSession[]>;
  softDelete(id: string): Promise<void>;
  deleteExpired(): Promise<number>;
}
