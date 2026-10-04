## Problem Statement

- A work item can become a feature only by retyping it as a prompt; nothing reads the code
  for the person first or records why a fix was chosen.
- The bug-solver prototype investigated in the user's own checkout with full tool access, kept
  hypotheses only in memory and had no tests.
- Feature agents run with full permissions in their worktree, so an investigation that should
  only read must not run as a feature.

## Product Shape

- **Investigation**: work item, repository path, the commit investigated, status
  (Pending | Running | Completed | Failed), summary, hypotheses, the agent used, timestamps,
  the error when failed, and once approved the chosen hypothesis and the feature it became.
- **Hypothesis**: number (1 is the most likely), title, root cause, confidence
  (High | Medium | Low), evidence (repository-relative file, optional line, note), a failing test
  that would prove it, and a fix plan.
- **Workspace**: `git worktree add --detach` of the repository's HEAD under the shep home,
  removed when the investigation ends however it ends. The user's checkout is never touched.
- **Read-only**: Claude Code gets only Read, Grep and Glob; for agents that cannot restrict
  tools, the detached worktree is the containment, and nothing from it is kept.
- **Repository**: given explicitly, otherwise the previous investigation's repository for the
  work item, otherwise the project's application repository; failing that, the user is asked
  to pick one.
- **Approval**: creates a feature (Fast by default, the spec pipeline with `--spec`) named
  `Fix <KEY>: <hypothesis title>` whose prompt carries the work item, the hypothesis, its
  evidence and test, and the instruction to write the failing test first; records the feature
  on the investigation; moves the work item to Started.

## User Flows

**F1. CLI.** `shep item investigate PAY-42 --repo ~/src/pay` shows progress, then the ranked
hypotheses. `shep item hypotheses PAY-42` shows the latest investigation again.
`shep item fix PAY-42 1` starts the fix feature from hypothesis 1 and prints its id.

**F2. Web.** The work item page has an Investigation panel: pick a repository, Investigate,
watch it run, read the hypotheses with their evidence, and press "Fix this" on one. The panel
then links the feature.

**F3. From a tracker.** An issue synced from Jira is investigated and fixed as above; when its
rule is two-way, the Jira issue moves to In Progress at the next sync.

## Success Criteria

- [ ] The investigated repository's working tree and branch are unchanged after any
      investigation, including a failed or timed-out one (integration test on a real repo).
- [ ] Hypotheses are numbered by confidence; evidence paths are repository-relative with
      forward slashes; at most five are kept (unit tests).
- [ ] Only one investigation per work item is active at a time; one left Running past the
      timeout by a dead process reads as Failed.
- [ ] A space that does not allow the agent refuses the investigation with the space's
      reason; the space's environment reaches the agent process.
- [ ] Approval creates the feature in the investigated repository with the hypothesis in its
      prompt, records it, and moves the work item to its first Started state.
- [ ] CLI and web show the same investigation; strings in the 9 locales; stories for every new
      component.

## Affected Areas

| Area | Impact | Reasoning |
| --- | --- | --- |
| TypeSpec | Low | WorkItemInvestigation, Hypothesis, HypothesisEvidence; 2 enums |
| Persistence | Low | Migration 155, one table |
| Agents | Low | Execution options carry a space environment to subprocess agents |
| Infrastructure | Medium | Detached-worktree workspace |
| Application | High | Investigate and approve use cases, prompt and result normalisation |
| CLI and Web | Medium | `shep item investigate / hypotheses / fix`, Investigation panel |

## Dependencies

- Spec 087 (work items), 120/121 (space environment), 122 (two-way status push).

## Out of Scope

- Running the code or tests during investigation (read-only first).
- Automatic investigation of every new bug (autopilot, a later spec).
- Posting hypotheses back to the tracker as comments (comments sync, a later spec).

## Size Estimate

**L**: 12 tasks.
