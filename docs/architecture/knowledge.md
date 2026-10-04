# Knowledge sources

Spec: [`specs/125-knowledge-sources`](../../specs/125-knowledge-sources/). User guide:
[`docs/guides/knowledge.md`](../guides/knowledge.md).

## Connections, generalised

Spec 122's tracker connections became plain `Connection`s (`tsp/domain/entities/connection.tsp`,
migration `157`): a provider (`Linear`, `Jira`, `Notion`), a space, an encrypted secret and a
health status. `domain/shared/connection-kind.ts` maps each provider to a `ConnectionKind`
(`Tracker` or `Knowledge`) through a total record, so a new provider fails to compile until it
has a kind.

`ManageConnectionsUseCase` creates, tests and removes any connection. It verifies credentials
through `IConnectionVerifier`, which `ConnectionVerifier` dispatches by kind to the tracker or
knowledge client factory. Errors are shared: `ConnectionAuthError`, `ConnectionRateLimitError`
and `ConnectionRequestError` (`ports/output/services/connection-errors.ts`), raised by both
families of clients through `infrastructure/services/connections/connection-http.ts` (timeout,
`Retry-After`). `connection-health.ts` records a run's outcome on its connection for both.

## Model

`tsp/domain/entities/knowledge.tsp`, tables in migration `158-create-knowledge`:

| Entity | Purpose |
| ------ | ------- |
| `KnowledgeSource` | A page tree or database of a knowledge connection, owned by the connection's space and optionally limited to one product line; interval, enabled, last run summary and error. |
| `KnowledgeDocument` | One synced page as Markdown, with its URL and Notion edit time; carries the source's space and product line so selection never joins. |

## Notion client

`NotionKnowledgeClient` implements `IKnowledgeClient` over an injected `fetch`
(Notion-Version `2022-06-28`):

- `describeScope(link)` parses the id from a link (`parseNotionId`) and asks for a database,
  then a page; a 404 means "not shared with the integration".
- `listPages` queries a database, or walks a page's block children collecting `child_page`s
  (also inside toggles and columns), at most `MAX_PAGE_TREE_DEPTH` (5) levels and
  `MAX_KNOWLEDGE_PAGES_PER_SOURCE` (500) pages.
- `readPage` fetches the page's blocks with their children and converts them with
  `notion-blocks.ts` (pure): headings, lists (nested), to-dos, code, quotes, callouts, toggles,
  tables, bookmarks; media become placeholders and child pages references.

## Sync

`SyncKnowledgeSourceUseCase` lists the scope's pages, reads only pages edited after their stored
document (or new ones), trims content to `MAX_DOCUMENT_CHARS`, then deletes documents of pages
that are gone. A page that fails to read is counted; a rejected token or rate limit stops the run
before anything is deleted. `SyncKnowledgeSourcesUseCase` runs due sources (`runDue`, by
`isIntervalDue` in `domain/shared/interval-schedule.ts`, shared with tracker rules) or every
enabled one (`runAll`).

The daemon (`_serve`) and `shep ui` start a due-work watcher for each through
`startBackgroundSync` (`src/presentation/cli/commands/background-sync.ts`):
`createDueWorkWatcher` (`infrastructure/services/scheduling/due-work-watcher.ts`) ticks every
minute on `IntervalTask`, which never overlaps runs.

## Selection

`domain/shared/knowledge.ts` is pure: `splitIntoPassages` cuts a document at its headings (each
passage keeps its heading path, "Guests › Limits") and long sections at paragraphs;
`rankPassages` scores query terms (`text-terms.ts`, shared with feedback themes) by rarity across the passages, weighting title and heading
terms, ignoring stopwords.

`SelectKnowledgeUseCase` resolves the repository's space and product line
(`ResolveSpaceContextUseCase`), takes the space-wide documents plus the product line's
(`IKnowledgeDocumentRepository.listVisible`), and renders the best passages within
`KNOWLEDGE_TOKEN_BUDGET` (1,000 tokens) as a `### Team knowledge` section.
`SelectProjectMemoryUseCase` appends it to the memory it gives agents, so every node that
reads project memory reads team knowledge too. Documents of another space are never visible;
`tests/integration/application/use-cases/spaces/space-memory-isolation.test.ts` checks it end
to end.

## Surfaces

| Surface | Entry point |
| ------- | ----------- |
| CLI | `shep connection add notion`, `shep knowledge source …`, `shep knowledge sync / ls / search` |
| Web | `/connections` (`components/features/knowledge/` inside the connection card); team knowledge on `/memory` |
| DI | `infrastructure/di/modules/register-knowledge.ts` |
