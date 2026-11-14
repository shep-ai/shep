# Linear GraphQL API fixtures

Answers the Linear task source receives from `POST https://api.linear.app/graphql`. Every
request names its operation (`ShepViewer`, `ShepRead`, `ShepComment`, …); the tests route on
that name. Each answer has the GraphQL shape `{"data": …}` (or `{"errors": […]}`) with exactly the
fields the adapter's documents select (`src/sources/linear/documents.rs`). Values are made up.

| File | Operation | Doc page |
| ---- | --------- | -------- |
| `viewer.json` | `ShepViewer`: `viewer`, `organization` | https://linear.app/developers/graphql (Queries: viewer) |
| `teams.json`, `teams_none.json` | `ShepTeam`: `teams(filter: { key })` | https://linear.app/developers/graphql (Queries: teams), https://linear.app/developers/filtering |
| `issues.json` | `ShepWaiting`, `ShepOffer`: `issues(filter, first, orderBy)` | https://linear.app/developers/filtering, https://linear.app/developers/pagination |
| `issue.json` | `ShepRead`: `issue(id: "ENG-342")` | https://linear.app/developers/graphql (Queries: issue by id or identifier) |
| `place.json`, `place_plain_team.json` | `ShepPlace`: the issue's team and its workflow states | https://linear.app/developers/graphql (workflowStates) |
| `comments.json` | `ShepReplies`: `issue.comments(filter: { createdAt })` | https://linear.app/developers/filtering |
| `comment_created.json` | `ShepComment`: `commentCreate` | https://linear.app/developers/graphql (Mutations) |
| `issue_updated.json` | `ShepMove`: `issueUpdate(id, input: { stateId })` | https://linear.app/developers/graphql (Mutations: issueUpdate) |
| `attachment_created.json` | `ShepAttach`: `attachmentCreate` | https://linear.app/developers/attachments |
| `not_found.json` | an unknown issue identifier | https://linear.app/developers/graphql (Errors) |
| `unauthenticated.json` | a revoked key | https://linear.app/developers/graphql (Errors) |

From the docs: a personal API key goes in `Authorization` with no `Bearer`; `issue(id:)` takes a
UUID or an identifier like `ENG-342`; `nodes` can be read without `edges`; errors come in an
`errors` list, possibly with HTTP 200; `attachmentCreate` is idempotent per issue and URL.

Not shown verbatim in the docs, written from the published schema and from experience, and
worth checking against a live workspace: the `Entity not found: Issue` message and its
`extensions`, the authentication error's wording, `eqIgnoreCase` on label and state names,
`team: { key: { eq } }` on issues, `CommentFilter` with `createdAt: { gte }`, the default sort
direction (the adapter sorts by itself), and `Team.states` as a connection.

`issues.json` holds ENG-342 (label `shep`), ENG-345 (state Tonight) and ENG-351 (neither); the
adapter hands over the first two. `comments.json` is newest first: the person's answer, Shep's
own question (signed `— sent by Shep`, written as the key's own user), and an older note.
