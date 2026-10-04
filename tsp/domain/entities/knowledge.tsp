/**
 * @module Shep.Domain.Entities.Knowledge
 *
 * Knowledge sources (spec 125): pages in a knowledge tool (Notion) kept in
 * sync as a space's knowledge documents, which agents working in the space's
 * repositories read as team knowledge.
 */
import "../../common/base.tsp";

/** What a knowledge source points at. */
@doc("What a knowledge source points at")
enum KnowledgeScopeKind {
  @doc("A page: the page and every page under it")
  Page,

  @doc("A database: every page in it")
  Database,
}

/** What one sync of a knowledge source did. */
@doc("What one sync of a knowledge source did")
model KnowledgeSyncSummary {
  @doc("Documents created from new pages")
  added: int32;

  @doc("Documents refreshed from edited pages")
  updated: int32;

  @doc("Documents deleted because their pages are gone")
  removed: int32;

  @doc("Pages that could not be read this run")
  failed: int32;
}

/** Pages of a knowledge tool kept as a space's knowledge. */
@doc("A page tree or database of a knowledge tool kept in sync as a space's knowledge")
model KnowledgeSource extends BaseEntity {
  @doc("The knowledge connection to read")
  connectionId: string;

  @doc("The space the documents belong to (the connection's space)")
  spaceId: string;

  @doc("Limit the documents to one product line of the space; unset makes them space-wide")
  productLineId?: string;

  @doc("The tool's id of the page or database")
  scopeId: string;

  @doc("Whether the scope is a page tree or a database")
  scopeKind: KnowledgeScopeKind;

  @doc("The page or database title when the source was added")
  scopeTitle: string;

  @doc("Minutes between automatic syncs")
  intervalMinutes: int32;

  @doc("Whether the daemon syncs this source")
  enabled: boolean;

  @doc("When the source last synced")
  lastRunAt?: utcDateTime;

  @doc("What the last sync did")
  lastRun?: KnowledgeSyncSummary;

  @doc("Why the last sync failed, when it did")
  lastError?: string;
}

/** One page of a knowledge source, as Markdown. */
@doc("One page of a knowledge source, as Markdown")
model KnowledgeDocument extends BaseEntity {
  @doc("The source it was synced by")
  sourceId: string;

  @doc("The space it belongs to")
  spaceId: string;

  @doc("The product line it is limited to; unset when space-wide")
  productLineId?: string;

  @doc("The tool's id of the page; unique per source")
  pageId: string;

  @doc("Page title")
  title: string;

  @doc("Link to the page")
  url: string;

  @doc("The page as Markdown")
  content: string;

  @doc("When the page was last edited in the tool")
  pageEditedAt: utcDateTime;
}
