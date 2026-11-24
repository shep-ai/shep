# Notion fixtures

Responses shaped like the Notion API at `Notion-Version: 2026-03-11` (databases hold data
sources; `in_trash`, no `archived`), following the OpenAPI schemas embedded in the reference pages
at `https://developers.notion.com/reference/*.md` (fetched 2026-11-14), with Acme names and times.

| File | Endpoint | Doc page |
| ---- | -------- | -------- |
| `users_me.json` | `GET /v1/users/me` | [Retrieve your token's bot user](https://developers.notion.com/reference/get-self) |
| `database.json` | `GET /v1/databases/{id}` | [Retrieve a database](https://developers.notion.com/reference/retrieve-a-database) |
| `data_source.json` | `GET /v1/data_sources/{id}` | [Retrieve a data source](https://developers.notion.com/reference/retrieve-a-data-source), [Data source properties](https://developers.notion.com/reference/property-object) |
| `query.json` | `POST /v1/data_sources/{id}/query` | [Query a data source](https://developers.notion.com/reference/query-a-data-source), [Filter data source entries](https://developers.notion.com/reference/filter-data-source-entries) |
| `page.json` | `GET /v1/pages/{id}`, `PATCH /v1/pages/{id}` | [Retrieve a page](https://developers.notion.com/reference/retrieve-a-page), [Update page](https://developers.notion.com/reference/patch-page), [Page property values](https://developers.notion.com/reference/page-property-values) |
| `page_missing.json` | any page call, 404 | [Status codes](https://developers.notion.com/reference/status-codes) |
| `page_markdown.json` | `GET /v1/pages/{id}/markdown?markdown_version=v2` | [Retrieve a page as markdown](https://developers.notion.com/reference/retrieve-page-markdown) |
| `comments.json` | `GET /v1/comments?block_id={page}` | [List comments](https://developers.notion.com/reference/list-comments), [Comment](https://developers.notion.com/reference/comment-object), [Comment display name](https://developers.notion.com/reference/comment-display-name) |
| `comment_created.json` | `POST /v1/comments` | [Create comment](https://developers.notion.com/reference/create-a-comment) |
| `blocks_appended.json` | `PATCH /v1/blocks/{page}/children` | [Append block children](https://developers.notion.com/reference/patch-block-children) |

The database has `Status` (status, with a Tonight option), `Shep` (rich text) and `PR` (url)
properties. In `comments.json` (oldest first, as the API sorts them) Dana writes before the
contract's `since` (2026-11-14 08:00 UTC) and after it, and the middle comment is Shep's own.
Page links use the `https://app.notion.com/p/{id}` form Notion moved to in June 2026.
