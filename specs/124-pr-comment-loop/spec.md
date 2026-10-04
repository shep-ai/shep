## Problem Statement

- No product code reads human review comments; `fetchExistingComments` keeps no ids, threads or
  replies and reads one page.
- Rejecting a run at the merge gate is the only way to send feedback, and it resets the feature
  to Implementation and drops its PR record.
- `PrSyncWatcher` runs under `shep ui` only, so a daemon started with `shep start` never sees
  a merge or a CI change.

## Product Shape

- **PR comment**: feature, GitHub id, kind (Inline | Conversation | Review), author, body, file
  and line for inline ones, review thread id, URL, when it was written, status (Pending |
  Addressing | Addressed | Declined | Failed), the reply posted and its URL, and the round that
  handled it. shep's own replies carry a hidden marker and are never read back as comments.
- **Round**: feature, comment ids, status (Running | Completed | Failed), the agent, the commit
  pushed, a summary, the error, timestamps. One round per feature at a time.
- **Addressing**: the agent works in the feature's worktree with the comments (file, line, diff
  hunk, body); it changes code where a comment asks for a change, runs the tests around it,
  commits and pushes to the feature branch (never force), and returns a reply per comment
  saying what it changed, answering a question, or why it disagrees. shep then posts each reply
  on its thread (inline) or as a quoted PR comment, with the commit, and resolves inline threads
  it changed when the space says so.
- **Trigger** (per space, default Mention): Off — only on request; Mention — comments that
  contain `#shep` are addressed automatically; All — every new comment is.
- **Daemon**: the PR comment sync runs every two minutes for features in Review with an open
  PR, alongside PR status sync, in both `shep start` and `shep ui`.

## User Flows

**F1. Ask shep to fix a nit.** A reviewer writes "#shep rename this to totalCents" on line 42.
Within two minutes the change is pushed and the thread has a reply naming the commit.

**F2. On request.** `shep feat comments 1a2b` lists the PR's comments and their state;
`shep feat address-comments 1a2b` addresses every pending one (or the ids given). The feature
drawer shows the same list with an "Address comments" button.

**F3. Pick the policy.** `shep space config acme --pr-comments all --resolve-threads`.

## Success Criteria

- [ ] Comments of all three kinds are read across pages, with thread ids, and stored once
      (re-reading is idempotent); shep's replies are never read back.
- [ ] A round commits and pushes in the worktree, posts one reply per comment on the right
      thread, and records it; a failed push posts nothing and leaves the comments pending.
- [ ] Only one round per feature runs at a time; a feature not in Review with an open PR is
      refused with the reason.
- [ ] The space's trigger decides what the daemon addresses; Off addresses nothing.
- [ ] gh runs with the space environment, so work and personal GitHub accounts stay apart.
- [ ] `shep start` tracks PR merges and CI as `shep ui` does.
- [ ] CLI and web agree; strings in the 9 locales; stories for every new component.

## Affected Areas

| Area | Impact | Reasoning |
| --- | --- | --- |
| TypeSpec | Medium | PrComment, PrCommentRound, 4 enums; two SpaceAgentSettings fields |
| Persistence | Medium | Migration 156: two tables, two spaces columns |
| Infrastructure | Medium | gh-based PR comment client (REST + GraphQL), daemon watcher |
| Application | High | Fetch, address, sync and list use cases; prompt |
| CLI and Web | Medium | `shep feat comments / address-comments`, space options, drawer section |

## Dependencies

- Spec 120/121 (spaces and their environment), the merge node's PR record.

## Out of Scope

- Webhook delivery of comment events (polling first; the tunnel stays a `shep ui` feature).
- Comments on PRs shep did not open.
- Re-running CI watch after a round (PR sync reports CI as it does today).

## Size Estimate

**L**: 12 tasks.
