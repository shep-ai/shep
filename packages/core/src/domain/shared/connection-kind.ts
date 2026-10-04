/**
 * What shep does with each connection provider's data (spec 125). The record
 * is total, so adding a provider is a compile error until it has a kind.
 *
 * Pure: no I/O. Per the domain/ convention, relative imports carry no
 * extension.
 */

import { ConnectionKind, ConnectionProvider } from '../generated/output';

const CONNECTION_KINDS: Record<ConnectionProvider, ConnectionKind> = {
  [ConnectionProvider.Linear]: ConnectionKind.Tracker,
  [ConnectionProvider.Jira]: ConnectionKind.Tracker,
  [ConnectionProvider.Notion]: ConnectionKind.Knowledge,
};

export function connectionKind(provider: ConnectionProvider): ConnectionKind {
  return CONNECTION_KINDS[provider];
}

/** The providers of one kind, in declaration order. */
export function providersOfKind(kind: ConnectionKind): ConnectionProvider[] {
  return Object.values(ConnectionProvider).filter(
    (provider) => CONNECTION_KINDS[provider] === kind
  );
}
