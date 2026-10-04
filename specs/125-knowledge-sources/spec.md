## Problem Statement

- No connector reads a knowledge base; agents never see a team's PRDs, runbooks or decisions.
- Connections, their errors and their HTTP plumbing are named and shaped for trackers only, so
  every new connector would copy them.
- Project memory holds short distilled facts (600 characters, 12 per category); whole
  documents do not fit it.

## Product Shape

- **Connection kinds**: every provider has a kind — Linear and Jira are trackers, Notion is
  knowledge. Tracker sync rules accept only tracker connections; knowledge sources only
  knowledge connections. One verifier checks credentials for every provider.
- **Knowledge source**: a Notion connection, a scope (a page — the page and every page under
  it — or a database — every page in it), an optional product line, an interval, enabled, and
  the last run's counts and error.
- **Knowledge document**: one Notion page as Markdown, with title, URL, the source it came
  from, the space (and product line), and the page's last edit time.
- **Sync**: list every page in scope; fetch the content of pages edited since their document
  was stored; delete documents whose pages are gone; record counts. A rejected token marks the
  connection Error; a rate limit stops the run and it is repeated next time.
- **Selection**: documents of the repository's space (all product lines' when the repository
  has none, its own line's and space-wide ones when it has one) are split into passages under
  their headings, ranked against the task text, and the best fit within the knowledge budget
  joins the project memory section, each passage naming its page.

## User Flows

**F1. Connect and choose.** `shep connection add notion --name "Acme Notion" --space acme`
(prompts for the integration token), then `shep knowledge source add acme-notion --scope
https://notion.so/acme/Payments-PRDs-1a2b...`. Within the interval the PRDs are knowledge.

**F2. See what agents see.** `shep knowledge search "refund guest orders" --repo ~/src/pay`
prints the passages an agent working on that would get; `shep knowledge ls --space acme` lists
the documents.

**F3. From the browser.** /connections adds a Notion connection and its sources like tracker
rules; the memory page lists a space's knowledge documents with links back to Notion.

## Success Criteria

- [ ] Linear, Jira and Notion connections share one entity, repository, verifier and page;
      tracker rules refuse a Notion connection and knowledge sources a tracker one.
- [ ] A Notion page tree and a database are listed across pages of results, nested pages
      included up to a depth limit; blocks convert to Markdown (headings, lists, to-dos, code,
      quotes, callouts, toggles, tables, links, child pages).
- [ ] A second sync fetches content only for edited pages and deletes documents of removed
      pages.
- [ ] An agent prompt in a repository of space A contains passages from A's documents and
      never from space B's; the knowledge budget is respected.
- [ ] The token is stored encrypted and never returned; strings in 9 locales; stories for
      every new component.

## Affected Areas

| Area | Impact | Reasoning |
| --- | --- | --- |
| TypeSpec | Medium | Connection split out; ConnectionKind; KnowledgeSource, KnowledgeDocument |
| Persistence | Medium | Migrations 157 (rename) and 158 (knowledge tables) |
| Infrastructure | High | Shared connection HTTP and errors; Notion client and block converter |
| Application | High | Connection verifier, knowledge sources, sync, selection into memory |
| CLI and Web | Medium | `shep connection add notion`, `shep knowledge …`, connections and memory pages |

## Dependencies

- Spec 120 (spaces, product lines), 122 (connections), 102 (project memory injection).

## Out of Scope

- Confluence, Google Docs and other knowledge providers (the kind and verifier make each one
  an adapter).
- Writing back to Notion (postmortems and plans, later specs).
- Embedding-based ranking of passages (lexical first, as memory does without a provider).

## Size Estimate

**L**: 13 tasks.
