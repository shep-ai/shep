# Review comments on shep's pull requests

When a feature opens a pull request, people review it on GitHub. Shep reads those review
comments and can address them for you: an agent changes the code in the feature's worktree,
pushes to the same branch, and replies on each comment saying what it changed, answering the
question, or explaining why it disagrees.

This works for features **waiting for review** (stopped at the merge step with an open pull
request).

## Ask on GitHub

Write `#shep` in a review comment:

> #shep rename `total` to `totalCents`, it holds cents

Shep checks for new comments every two minutes; once the agent is done, the change is pushed
and the comment has a reply like:

> Renamed to `totalCents` in refund-order.ts and its tests.
>
> Changed in c0ffee1.

This needs shep running in the background: `shep start` or `shep ui`.

## Choose what shep answers

Each [space](./spaces.md) decides which comments are addressed without being asked:

| Setting | What happens |
| ------- | ------------ |
| `mention` (default) | Comments that contain `#shep` |
| `all` | Every new review comment |
| `off` | Nothing; you start each round yourself |

```bash
shep space config acme --pr-comments all
shep space config acme --resolve-threads     # resolve a thread after changing code for it
```

In the browser: **Spaces**, then **Agent settings** on the space's card.

By default threads are left open for the reviewer to resolve.

## Address comments yourself

```bash
shep feat comments 1a2b                  # the PR's comments and what happened to each
shep feat address-comments 1a2b          # address every pending comment
shep feat address-comments 1a2b c0ffee00 # only this one (ids from `shep feat comments`)
```

In the browser, open the feature's **Merge Review** tab. Under the diff, **Review comments**
lists the comments; **Address N pending** starts a round, and the list updates when it ends.

## What a round does

1. The agent gets the pending comments (up to 20), with the file, line and diff around inline
   ones, in the feature's worktree.
2. It changes code where a comment asks for a change, runs the tests around it, commits, and
   pushes the feature branch. It never force-pushes or rebases.
3. Shep replies to each comment: in the review thread for inline comments, or as a new comment
   that quotes the original for conversation and review comments. A reply for a code change
   names the commit.

The round runs as the space's accounts (its GitHub login and git identity), like the
feature's own runs. If the agent leaves changes uncommitted or unpushed, shep commits them as
`fix: address review comments` and pushes them itself. That fallback push uses your machine's
git setup, not the space's.

If the change can't be pushed, nothing is replied and the comments are marked failed. Fix
the branch, then run the round again; failed comments are picked up again. A round has a
30-minute limit, and only one runs per feature at a time.

## Things to know

- **Shep's replies are skipped.** Each reply carries an invisible marker, so shep never
  answers itself, even though `gh` posts replies from your own account.
- **Bots are skipped.** Comments from GitHub apps and bots are not stored.
- **Resolved threads count as addressed.** A comment in a thread that was already resolved
  isn't picked up.
- **`shep start` now tracks pull requests.** Merges, closes and CI results are tracked by the
  background daemon too, not only by `shep ui`.
