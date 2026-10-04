# PR comment loop

Spec 124. Review comments on the pull request a feature opened are read, stored and addressed
in rounds; shep replies on GitHub. User guide: [`docs/guides/pr-comments.md`](../guides/pr-comments.md).

## Model

`tsp/domain/entities/pr-comment.tsp`:

- `PrComment`: feature, GitHub id, `PrCommentKind` (Inline | Conversation | Review), author,
  body, path/line/diff hunk/review thread id for inline comments, URL, when it was written,
  `PrCommentStatus` (Pending | Addressing | Addressed | Declined | Failed), reply and reply URL,
  round, error. Unique per (feature, kind, GitHub id).
- `PrCommentRound`: feature, comment ids, `PrCommentRoundStatus` (Running | Completed | Failed),
  agent, commit pushed, summary, error.
- `SpaceAgentSettings.prCommentTrigger` (`PrCommentTrigger` Off | Mention | All; unset =
  Mention) and `prCommentResolveThreads`.

Tables `pr_comments` and `pr_comment_rounds`, two `spaces` columns (migration 156).

Pure rules in `domain/shared/pr-comments.ts`: `#shep` mention detection, `isAutoAddressed`,
the reply marker (`<!-- shep:pr-comment-reply -->`) and `isShepReply`, reply text with the
commit, the quote for conversation replies, the 30-minute round budget and abandonment.

## GitHub

`IPullRequestCommentService`, implemented by `GhPullRequestCommentService`
(`infrastructure/services/git/`), runs `gh` in the feature's worktree with the space
environment:

| Call | gh |
| ---- | -- |
| list | `api --paginate repos/{owner}/{repo}/pulls/{n}/comments`, `.../issues/{n}/comments`, `.../pulls/{n}/reviews` (`--jq '.[]'`) plus GraphQL `reviewThreads(first: 100)` for thread ids and resolution |
| reply | GraphQL `addPullRequestReviewThreadReply` (inline with a thread), REST `pulls/{n}/comments/{id}/replies` (inline without), REST `issues/{n}/comments` (others) |
| resolve | GraphQL `resolveReviewThread` |

## Use cases (`application/use-cases/pr-comments/`)

- `FetchPrCommentsUseCase.execute(featureRef)`: the feature must be in Review with an open PR.
  Stores new comments as Pending (Addressed when their thread is resolved), updates edited
  bodies, skips bots and shep replies.
- `AddressPrCommentsUseCase`:
  - `start({ feature, commentIds? })` refuses while a round runs and takes Pending or Failed
    comments (ids or unique prefixes; at most 20). It resolves the agent (the feature run's,
    else settings), checks that the space allows it, and records a Running round with its
    comments Addressing.
  - `run(roundId)` makes one `IStructuredAgentCaller.call` in the worktree with the space
    environment (`ADDRESS_RESULT_SCHEMA`: summary plus a `changed | answered | declined` reply
    per comment). `ensurePushed` commits leftovers and pushes if the remote branch lacks HEAD.
    Then each comment is answered, threads are resolved per the space, and the round is
    recorded. Any failure before replying fails the round and its comments.
- `GetPrCommentsUseCase`: stored comments and rounds; abandoned rounds are failed on read.
- `SyncPrCommentsUseCase.runDue()`: for each feature in Review with an open PR, fetches, then
  starts and runs a round for the Pending comments `isAutoAddressed` selects.

## Daemon

`src/presentation/cli/commands/background-sync.ts` starts the same background sync in
`_serve` (`shep start`) and `shep ui`: retention, tracker sync, `PrSyncWatcher` (previously
only in `shep ui`), and the PR comment watcher (`IntervalTask`, every two minutes, never
overlapping).

## Surfaces

| Surface | Entry point |
| ------- | ----------- |
| CLI | `shep feat comments`, `shep feat address-comments`, `shep space config --pr-comments / --resolve-threads` |
| Web | Review comments section in the Merge Review tab (`components/features/pr-comments/`), actions in `app/actions/pr-comments.ts`; space agent settings form |
| DI | `infrastructure/di/modules/register-pr-comments.ts` |
