/** Builds the knowledge client for a connection's provider (spec 125). */

import { ConnectionProvider } from '../../../domain/generated/output.js';
import type { ConnectionCredentials } from '../../../application/ports/output/services/connection-verifier.interface.js';
import type {
  IKnowledgeClient,
  IKnowledgeClientFactory,
} from '../../../application/ports/output/services/knowledge-client.interface.js';
import { ConnectionRequestError } from '../../../application/ports/output/services/connection-errors.js';
import type { FetchFunction } from '../connections/connection-http.js';
import { NotionKnowledgeClient } from './notion-knowledge.client.js';

export class KnowledgeClientFactory implements IKnowledgeClientFactory {
  constructor(private readonly fetchFn: FetchFunction = fetch) {}

  create(credentials: ConnectionCredentials): IKnowledgeClient {
    switch (credentials.provider) {
      case ConnectionProvider.Notion:
        return new NotionKnowledgeClient(credentials.secret, this.fetchFn);
      case ConnectionProvider.Linear:
      case ConnectionProvider.Jira:
        throw new ConnectionRequestError(`${credentials.provider} is not a knowledge tool.`);
    }
  }
}
