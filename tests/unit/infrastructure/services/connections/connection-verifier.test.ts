import { describe, it, expect, vi } from 'vitest';
import { ConnectionVerifier } from '@/infrastructure/services/connections/connection-verifier.js';
import { KnowledgeClientFactory } from '@/infrastructure/services/knowledge/knowledge-client.factory.js';
import { NotionKnowledgeClient } from '@/infrastructure/services/knowledge/notion-knowledge.client.js';
import { TrackerClientFactory } from '@/infrastructure/services/trackers/tracker-client.factory.js';
import { ConnectionRequestError } from '@/application/ports/output/services/connection-errors.js';
import { ConnectionProvider } from '@/domain/generated/output.js';
import type { ITrackerClientFactory } from '@/application/ports/output/services/tracker-client.interface.js';
import type { IKnowledgeClientFactory } from '@/application/ports/output/services/knowledge-client.interface.js';

describe('ConnectionVerifier', () => {
  it('checks trackers with their tracker client and knowledge tools with their knowledge client', async () => {
    const trackers = { create: vi.fn(() => ({ testConnection: async () => ({ name: 'Ada' }) })) };
    const knowledge = { create: vi.fn(() => ({ verify: async () => ({ name: 'Acme' }) })) };
    const verifier = new ConnectionVerifier(
      trackers as unknown as ITrackerClientFactory,
      knowledge as unknown as IKnowledgeClientFactory
    );
    expect(await verifier.verify({ provider: ConnectionProvider.Linear, secret: 'k' })).toEqual({
      name: 'Ada',
    });
    expect(await verifier.verify({ provider: ConnectionProvider.Notion, secret: 't' })).toEqual({
      name: 'Acme',
    });
    expect(trackers.create).toHaveBeenCalledWith({
      provider: ConnectionProvider.Linear,
      secret: 'k',
    });
    expect(knowledge.create).toHaveBeenCalledWith({
      provider: ConnectionProvider.Notion,
      secret: 't',
    });
  });
});

describe('client factories', () => {
  it('build a Notion knowledge client, and refuse other kinds', () => {
    expect(
      new KnowledgeClientFactory().create({ provider: ConnectionProvider.Notion, secret: 't' })
    ).toBeInstanceOf(NotionKnowledgeClient);
    expect(() =>
      new KnowledgeClientFactory().create({ provider: ConnectionProvider.Jira, secret: 't' })
    ).toThrow(ConnectionRequestError);
    expect(() =>
      new TrackerClientFactory().create({ provider: ConnectionProvider.Notion, secret: 't' })
    ).toThrow(/Notion is not an issue tracker/);
  });
});
