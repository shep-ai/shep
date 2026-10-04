/**
 * A connection's health after a sync (spec 122, shared in spec 125): broken
 * when the tool rejected its credentials, healthy again after a clean run.
 */

import { ConnectionStatus, type Connection } from '../../../domain/generated/output.js';
import type { IConnectionRepository } from '../../ports/output/repositories/connection-repository.interface.js';

export async function recordConnectionHealth(
  connections: IConnectionRepository,
  connection: Connection,
  error: string | undefined,
  rejected: boolean
): Promise<void> {
  const recovered = error === undefined && connection.status === ConnectionStatus.Error;
  if (!rejected && !recovered) return;
  const { lastError: _previous, ...rest } = connection;
  await connections.update({
    ...rest,
    status: rejected ? ConnectionStatus.Error : ConnectionStatus.Connected,
    ...(rejected && error ? { lastError: error } : {}),
    updatedAt: new Date(),
  });
}
