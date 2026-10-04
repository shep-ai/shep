/**
 * Shared helpers for the tracker sync use cases (spec 122): result objects,
 * lookups by id or slug, and turning a thrown error into a message.
 */

import type { Connection } from '../../../domain/generated/output.js';
import type { IConnectionRepository } from '../../ports/output/repositories/connection-repository.interface.js';

export type TrackerResult<T extends object = object> =
  | ({ ok: true } & T)
  | { ok: false; error: string };

export function failure(error: string): { ok: false; error: string } {
  return { ok: false, error };
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** A connection by id or slug. */
export async function findConnection(
  connections: IConnectionRepository,
  ref: string
): Promise<Connection | null> {
  const key = ref.trim();
  if (!key) return null;
  return (await connections.findById(key)) ?? (await connections.findBySlug(key.toLowerCase()));
}
