# Hacker News Show HN — Launch Post

Prepared content for the Shep Show HN submission. All messaging follows the [positioning guide](./positioning-guide.md).

---

## Post Title

```
Show HN: Shep – Ship features 10x faster with parallel AI agents in git worktrees
```

**Character count**: 76 (under 80 limit)

## Post URL

```
https://github.com/shep-ai/shep
```

## Post Description (Text Field)

```
Shep runs each feature in its own git worktree with its own AI agent — and handles the rest: committing, pushing, opening PRs, watching CI, and retrying failures.

The problem: one AI coding session is fine. Five is chaos — context switching, branch conflicts, stale worktrees, forgotten CI runs.

Shep gives each feature an isolated world: a worktree, a branch, an agent session. You manage it all from one dashboard or the terminal.

Key details:
- Works with Claude Code, Cursor CLI, and Gemini CLI
- 100% local — all data in ~/.shep/ as SQLite, no cloud, no account
- MIT licensed
- Install: npx @shepai/cli

Benchmarked 3-5x wall-clock speedup from parallelism alone on 5 features (methodology published in the repo). Additional gains from automated git ops, CI monitoring, and eliminated context switching.

We've been shipping weekly for 185+ releases. Happy to answer any questions about the architecture, agent orchestration, or how worktree-based parallelism works in practice.
```

## Creator First Comment

Post this immediately after submission:

```
Hi HN — I'm the builder behind Shep.

I started using AI coding agents about a year ago. Single sessions worked great — describe
a feature, agent writes it, review, merge. But once I tried running multiple features at
the same time, everything fell apart.

The agents aren't the bottleneck. The workflow around them is. Branch management, context
switching, stashing and unstashing, watching CI across multiple PRs, figuring out which
worktree has which changes. I was spending more time managing the agents than the agents
were spending coding.

Shep came from that frustration. The core idea is simple: each feature gets its own git
worktree with its own agent session. Shep handles the boring parts — creating the branch,
committing, pushing, opening a PR, watching CI, and retrying if something fails. You just
describe what you want and monitor from one dashboard.

Some technical decisions people might find interesting:

- **Worktree-based isolation**: Each feature is a real git worktree, not a container or
  VM. This means zero overhead, full filesystem access, and the agent can use any tool
  in your PATH. The tradeoff is that worktrees share the same .git directory, so Shep
  has to be careful about concurrent git operations.

- **Agent-agnostic**: Shep doesn't wrap or proxy the agent. It spawns whatever CLI
  agent you've configured (Claude Code, Cursor CLI, Gemini CLI) in the worktree
  directory and communicates through the agent's native streaming protocol. Swapping
  agents is a one-line config change.

- **CI watch loop**: After pushing, Shep polls your CI via the GitHub API, reads failure
  logs, feeds them back to the agent, and pushes a fix. This retry loop is what makes
  "prompt to PR" actually work — most first-pass implementations fail CI, and the
  interesting part is the automated recovery.

- **Clean Architecture in TypeScript**: Four-layer architecture (Domain, Application,
  Infrastructure, Presentation) with dependency injection. Domain models are generated
  from TypeSpec. I'm a big believer in TypeSpec for domain modeling — it's like protobuf
  but more ergonomic for TypeScript projects.

The honest numbers: parallelism alone gives 3-5x speedup for 5 concurrent features
(we published the benchmark methodology in the repo). "10x" in the headline accounts for
automation savings on top of that — it's the aspirational upper bound, not a guaranteed
minimum for every workflow.

What Shep is NOT: a security scanner, a CI replacement, or a code editor. It's an
orchestration layer. Your agent does the coding, your CI does the testing, your review
process does the gatekeeping.

Happy to answer questions about the architecture, the agent orchestration model, or
anything else. And yes, Shep is being used to develop itself — most PRs in the repo
were created by Shep-orchestrated agent sessions.
```

## Scheduling

- **Day**: Tuesday, Wednesday, or Thursday
- **Time**: 8:00-9:00 AM Eastern (US morning, peak HN traffic)
- **Optimal window**: Tuesday or Wednesday morning for maximum visibility
- **Avoid**: Mondays (competing with weekend projects), Fridays (low engagement), weekends

## Pre-Submission Checklist

- [ ] README is updated with pain-first structure (Phase 2)
- [ ] Plugin is submitted to Claude Code marketplace (Phase 3)
- [ ] Demo GIF is embedded in README (or placeholder screenshot is compelling)
- [ ] GitHub topics and description are updated (Phase 1)
- [ ] All links in the README work correctly
- [ ] Speed benchmark is published and linked
- [ ] `npx @shepai/cli` installs and runs correctly on a clean machine
- [ ] No broken CI — green badge on README

## Post-Submission Actions

1. Post the creator first comment immediately (within 1 minute)
2. Monitor the post for the first 2 hours — respond to comments promptly
3. Be authentic: answer technical questions with depth, acknowledge limitations honestly
4. If asked about competitors (Emdash, Metaswarm, Superset), be respectful — explain what's different without putting them down
5. Track stars/day and traffic via GitHub Insights
6. Cross-post to Twitter/X with the thread (task-13) once the HN post has 10+ upvotes

---

_All messaging follows the [positioning guide](./positioning-guide.md). Update this document if the guide changes._
