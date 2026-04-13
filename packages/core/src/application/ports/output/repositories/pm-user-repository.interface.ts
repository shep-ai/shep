/**
 * PmUser Repository Interface (Output Port)
 *
 * Defines the contract for PmUser entity persistence operations.
 * Implementations handle database-specific logic (SQLite, etc.).
 */

import type { PmUser } from '../../../../domain/generated/output.js';

export interface IPmUserRepository {
  create(user: PmUser): Promise<void>;
  findById(id: string): Promise<PmUser | null>;
  findByEmail(email: string): Promise<PmUser | null>;
  findSystemUser(): Promise<PmUser | null>;
  list(): Promise<PmUser[]>;
  update(
    id: string,
    fields: Partial<Pick<PmUser, 'email' | 'passwordHash' | 'displayName'>>
  ): Promise<void>;
  softDelete(id: string): Promise<void>;
}
