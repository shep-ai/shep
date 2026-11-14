# Monday fixtures

GraphQL responses shaped like the monday.com platform API at `API-Version: 2026-10`, following
the reference pages at `https://developer.monday.com/api-reference/*.md` (fetched 2026-11-14),
with Acme names and times. Every call is `POST /v2`; the adapter names each operation
(`ShepAccount`, `ShepBoard`, …) and the tests route on that name.

| File | Operation | Doc page |
| ---- | --------- | -------- |
| `account.json` | `query ShepAccount { me { name account { name slug } } boards(ids:) { name } }` | [Me](https://developer.monday.com/api-reference/reference/me), [Account](https://developer.monday.com/api-reference/reference/account) |
| `board.json` | `query ShepBoard { … boards(ids:) { columns { id title type settings } } }` | [Columns](https://developer.monday.com/api-reference/reference/columns), [Status: reading column configuration](https://developer.monday.com/api-reference/reference/status) |
| `items_page.json` | `query ShepTonight` / `ShepNewest` (`items_page` with `query_params`) | [Items page](https://developer.monday.com/api-reference/reference/items-page), [Items page other types](https://developer.monday.com/api-reference/reference/items-page-other-types), [Status: filter](https://developer.monday.com/api-reference/reference/status) |
| `item.json`, `item_missing.json` | `query ShepRead { items(ids:) { … } }` | [Items](https://developer.monday.com/api-reference/reference/items) |
| `updates.json` | `query ShepUpdates { items(ids:) { updates { … replies { … } } } }` | [Updates](https://developer.monday.com/api-reference/reference/updates), [Replies](https://developer.monday.com/api-reference/reference/replies) |
| `create_update.json` | `mutation ShepPost { create_update(item_id:, body:) { id } }` | [Updates: create update](https://developer.monday.com/api-reference/reference/updates) |
| `change_columns.json` | `mutation ShepFill { change_multiple_column_values(…) { id } }` | [Changing column values](https://developer.monday.com/api-reference/docs/change-column-values), [Link](https://developer.monday.com/api-reference/reference/link), [Status: update value](https://developer.monday.com/api-reference/reference/status) |
| `unauthorized.json` | a GraphQL error answered with HTTP 200 | [Errors](https://developer.monday.com/api-reference/docs/errors) (not reachable when fetched; shape from memory of the documented format) |

The status column's settings use the typed `settings` object (`settings_str` is deprecated since
2025-10); a label's `id`, not its display `index`, is what filters and updates take. Updates
come newest first, as the API returns them. In `updates.json`, Shep asked a question at 02:15,
Dana replied before and after the contract's `since` (2026-11-14 08:00 UTC), and Shep's own
Ready update at 08:31 must not come back as a reply.
