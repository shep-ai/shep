## Findings

- Notion: Bearer integration token, Notion-Version 2022-06-28; GET /v1/users/me names the
  bot's workspace; GET /v1/blocks/{id}/children (paginated, has_children) walks pages and
  content; POST /v1/databases/{id}/query lists a database; 429 carries Retry-After.
- Pages are only visible to an integration once shared with it in Notion; a 404 on the scope
  means "not shared", which the error says.
- Project memory selection merges repository, product line and space entries and renders a
  Markdown blob injected into every phase and the interactive boot prompt.
