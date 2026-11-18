# GitHub REST API fixtures

Answers the GitHub task source receives, for API version `2022-11-28` (the version its requests
name in `X-GitHub-Api-Version`). Field names and types follow the response schemas on these
pages; each file carries the fields the schema lists for that object, with a few long URL
fields left out of nested users and of the repository. Values are made up (`acme/app`,
`octocat`).

| File | Request | Doc page |
| ---- | ------- | -------- |
| `user.json` | `GET /user` | https://docs.github.com/en/rest/users/users#get-the-authenticated-user |
| `repo.json` | `GET /repos/{owner}/{repo}` | https://docs.github.com/en/rest/repos/repos#get-a-repository |
| `issues.json` | `GET /repos/{owner}/{repo}/issues` | https://docs.github.com/en/rest/issues/issues#list-repository-issues |
| `issue.json` | `GET /repos/{owner}/{repo}/issues/{issue_number}` | https://docs.github.com/en/rest/issues/issues#get-an-issue |
| `comments.json` | `GET /repos/{owner}/{repo}/issues/{issue_number}/comments` | https://docs.github.com/en/rest/issues/comments#list-issue-comments |
| `comment_created.json` | `POST /repos/{owner}/{repo}/issues/{issue_number}/comments` (201) | https://docs.github.com/en/rest/issues/comments#create-an-issue-comment |
| `not_found.json` | any 404 | https://docs.github.com/en/rest/using-the-rest-api/troubleshooting-the-rest-api |

Behaviour taken from the docs: pull requests appear in the issue list and carry a
`pull_request` key; `labels` filters by comma-separated names; `since` on comments filters by
*update* time (so the adapter also checks `created_at`); comments come oldest first; `body` may
be `null`.

`issues.json` holds a pull request (#413) and an unlabelled issue (#411) on purpose: the adapter
must skip the first and, for hand-over, the second.

`comments.json`: #3002 is Shep's own question (it ends with the hidden marker
`<!-- shep:update -->` and is written as the same account as the person), #3001 is older than
the tests' `since`, #3003 is the person's answer.
