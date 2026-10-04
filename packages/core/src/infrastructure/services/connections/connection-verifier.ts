/**
 * Checks a connection's credentials with the client of its kind (spec 125):
 * trackers through their tracker client, knowledge tools through their
 * knowledge client.
 */

import { ConnectionKind } from '../../../domain/generated/output.js';
import { connectionKind } from '../../../domain/shared/connection-kind.js';
import type {
  ConnectionAccount,
  ConnectionCredentials,
  IConnectionVerifier,
} from '../../../application/ports/output/services/connection-verifier.interface.js';
import type { ITrackerClientFactory } from '../../../application/ports/output/services/tracker-client.interface.js';
import type { IKnowledgeClientFactory } from '../../../application/ports/output/services/knowledge-client.interface.js';

export class ConnectionVerifier implements IConnectionVerifier {
  constructor(
    private readonly trackers: ITrackerClientFactory,
    private readonly knowledge: IKnowledgeClientFactory
  ) {}

  async verify(credentials: ConnectionCredentials): Promise<ConnectionAccount> {
    switch (connectionKind(credentials.provider)) {
      case ConnectionKind.Tracker:
        return this.trackers.create(credentials).testConnection();
      case ConnectionKind.Knowledge:
        return this.knowledge.create(credentials).verify();
    }
  }
}
