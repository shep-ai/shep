# Investigating and fixing bugs

When a bug lands in a shep project, typed in shep or synced from Linear or Jira, an agent can
read the code for you before anyone touches it. It returns the likely root causes, ranked, with
the code that points to each. You pick one and shep starts a fix that proves the cause with a
failing test before changing anything.

## 1. Investigate

On the work item page, the **Investigation** panel lists your repositories. Pick the one the
bug lives in and press **Investigate**. From the terminal:

```bash
shep item investigate PAY-42 --repo ~/src/pay
shep item investigate PAY-42 --agent codex-cli     # another agent than your default
```

The agent reads a **throwaway copy** of the repository's current commit, made with
`git worktree add --detach` under your shep home. Your checkout, its branch and any uncommitted
work are not touched. The copy is deleted when the investigation ends, whether it succeeds or
fails; a copy left behind by a crash is removed by the next investigation.
Claude Code is limited to reading and searching (Read, Grep, Glob); other agents are told not to
change anything, and any change they make anyway stays in the copy.

The investigation runs under the repository's [space](./spaces.md): its Claude and GitHub
logins and its allowed agents apply. If the space doesn't allow the agent, shep says so and
nothing runs.

Without `--repo`, shep uses the repository of the item's last investigation, then the
repository of the project's application. If it knows neither, it asks you to pick one.

An investigation takes a few minutes and has a 20-minute limit. The page updates by itself.
`shep item investigate` waits and prints the result. Only one investigation of an item runs at a
time; one left running by a restart shows as failed after 25 minutes.

## 2. Read the hypotheses

Up to five, most likely first. Each has:

- **Root cause:** what goes wrong, in terms of the code.
- **Confidence:** High when the code shows the defect directly, Medium when it fits the report
  but isn't confirmed, Low when it's possible but the evidence is thin.
- **Evidence:** files and lines the agent read, with what each shows.
- **Failing test:** the test that would fail today because of this cause.
- **Fix:** the smallest change that fixes it.

```bash
shep item hypotheses PAY-42      # the latest investigation again
```

If the agent can't match the report to the code, the investigation fails with its summary
explaining why. Try another repository or add detail to the report.

## 3. Fix

Press **Fix this** on a hypothesis, or:

```bash
shep item fix PAY-42 1              # Fast mode
shep item fix PAY-42 1 --spec       # the full spec pipeline
```

Shep creates a feature named `Fix PAY-42: <hypothesis>` in the investigated repository. Its
agent is told to write the failing test first and confirm it fails for the diagnosed reason, and
to stop and report instead of changing code if the test passes. Then it makes the fix and runs
the tests. From there it is an ordinary feature: worktree, approvals, CI and PR as you have them
configured.

The work item moves to its project's **Started** state (the default one, or the first). If the item came from a two-way
[sync rule](./trackers.md), the issue in Linear or Jira moves to In Progress at the next sync.

One hypothesis per investigation becomes a fix. To try another cause, investigate again.
