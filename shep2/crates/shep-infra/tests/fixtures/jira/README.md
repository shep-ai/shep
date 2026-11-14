# Jira Cloud fixtures

Responses shaped like Jira Cloud REST API v3, taken from the examples and schemas in Atlassian's
OpenAPI document (`https://developer.atlassian.com/cloud/jira/platform/swagger-v3.v3.json`,
fetched 2026-11-14), with Acme names and times.

| File | Endpoint | Doc page |
| ---- | -------- | -------- |
| `myself.json` | `GET /rest/api/3/myself` | [Myself: Get current user](https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-myself/#api-rest-api-3-myself-get) |
| `statuses.json` | `GET /rest/api/3/status` | [Workflow statuses: Get all statuses](https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-workflow-statuses/#api-rest-api-3-status-get) |
| `search.json` | `POST /rest/api/3/search/jql` | [Issue search: Search for issues using JQL enhanced search](https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-issue-search/#api-rest-api-3-search-jql-post) |
| `issue.json`, `issue_missing.json` | `GET /rest/api/3/issue/{key}` (200, 404) | [Issues: Get issue](https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-issues/#api-rest-api-3-issue-issueidorkey-get) |
| `transitions.json` | `GET /rest/api/3/issue/{key}/transitions?expand=transitions.fields` | [Issues: Get transitions](https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-issues/#api-rest-api-3-issue-issueidorkey-transitions-get) |
| (204, empty) | `POST /rest/api/3/issue/{key}/transitions` | [Issues: Transition issue](https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-issues/#api-rest-api-3-issue-issueidorkey-transitions-post) |
| `comments.json` | `GET /rest/api/3/issue/{key}/comment?orderBy=-created` | [Issue comments: Get comments](https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-issue-comments/#api-rest-api-3-issue-issueidorkey-comment-get) |
| `comment_created.json` | `POST /rest/api/3/issue/{key}/comment` | [Issue comments: Add comment](https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-issue-comments/#api-rest-api-3-issue-issueidorkey-comment-post) |
| `remotelink_created.json` | `POST /rest/api/3/issue/{key}/remotelink` | [Issue remote links: Create or update remote issue link](https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-issue-remote-links/#api-rest-api-3-issue-issueidorkey-remotelink-post) |

Comment and description bodies are [Atlassian Document Format](https://developer.atlassian.com/cloud/jira/platform/apis/document/structure/).
The newest comment in `comments.json` is one Shep posted (it starts with Shep's mark); one person's
comment is after the contract's `since` (2026-11-14 08:00 UTC, written in `+0100`) and one before.
