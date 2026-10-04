/**
 * Knowledge client port (spec 125): what knowledge sync needs from a
 * knowledge tool (Notion first). Implementations live in
 * infrastructure/services/knowledge.
 */

import type { KnowledgeScopeKind } from '../../../../domain/generated/output.js';
import type { ConnectionAccount, ConnectionCredentials } from './connection-verifier.interface.js';

/** A page or database a knowledge source points at. */
export interface KnowledgeScope {
  id: string;
  kind: KnowledgeScopeKind;
  title: string;
}

/** One page in a scope, without its content. */
export interface KnowledgePageRef {
  pageId: string;
  title: string;
  url: string;
  editedAt: Date;
}

export interface IKnowledgeClient {
  verify(): Promise<ConnectionAccount>;
  /**
   * The page or database a user gave (an id or a link). Throws
   * ConnectionRequestError when it does not exist or is not shared with the
   * integration.
   */
  describeScope(scopeRef: string): Promise<KnowledgeScope>;
  /** Every page in the scope: a page and the pages under it, or a database's pages. */
  listPages(scope: KnowledgeScope): Promise<KnowledgePageRef[]>;
  /** A page's content as Markdown. */
  readPage(pageId: string): Promise<string>;
}

export interface IKnowledgeClientFactory {
  create(credentials: ConnectionCredentials): IKnowledgeClient;
}
