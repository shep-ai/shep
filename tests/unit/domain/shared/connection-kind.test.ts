import { describe, it, expect } from 'vitest';
import { connectionKind, providersOfKind } from '@/domain/shared/connection-kind.js';
import { ConnectionKind, ConnectionProvider } from '@/domain/generated/output.js';

describe('connection kinds', () => {
  it('knows what each provider is for', () => {
    expect(connectionKind(ConnectionProvider.Linear)).toBe(ConnectionKind.Tracker);
    expect(connectionKind(ConnectionProvider.Jira)).toBe(ConnectionKind.Tracker);
    expect(connectionKind(ConnectionProvider.Notion)).toBe(ConnectionKind.Knowledge);
  });

  it('lists the providers of a kind', () => {
    expect(providersOfKind(ConnectionKind.Tracker)).toEqual([
      ConnectionProvider.Linear,
      ConnectionProvider.Jira,
    ]);
    expect(providersOfKind(ConnectionKind.Knowledge)).toEqual([ConnectionProvider.Notion]);
  });
});
