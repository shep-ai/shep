# Why We Built Shep

*The problem isn't the AI coding agent. It's everything around it.*

---

I started using AI coding agents about a year ago. The first time I gave Claude Code a feature description and watched it write working code, commit it, and explain what it did — I was hooked. This was clearly the future of software development.

Then I tried running two features at the same time.

## The chaos of parallel agents

One AI coding session works great. You describe what you want, the agent writes it, you review, you merge. Clean and simple.

But software development isn't one feature at a time. A typical day might look like this: you're adding Stripe payments, your teammate asked for a dark mode toggle, there's a login redirect bug that's been open for a week, and QA just reported a regression in the checkout flow. Four things. All independent. All urgent.

With a single agent session, you're serializing them. Start payments, wait 15 minutes, review, merge, move on. Four features takes an hour of wall-clock time — and that's if nothing fails CI on the first try.

"Just run them in parallel," I thought. Open four terminal tabs. Start four agent sessions.

Here's what actually happens:

**Branch conflicts.** You're on `main` in all four terminals. The first agent creates a branch and starts working. The second agent tries to create a branch — but now your working directory has uncommitted changes from the first agent's setup. You need to stash, create a new branch, unstash. Repeat for each agent.

**Worktree confusion.** Okay, you learn about git worktrees. Now each agent has its own directory. But you're manually creating worktrees, setting up branches, remembering which directory has which feature. Your terminal has eight tabs and you can't remember which one is the dark mode toggle.

**CI babysitting.** Agent finishes, you push, CI runs. You switch to the next feature. Twenty minutes later you remember: did CI pass on the payments PR? You check — it failed. The agent needs to see the logs, fix the issue, push again. But you've moved on. The CI failure sits there.

**Context switching tax.** Every time you switch between features, you lose 5-10 minutes reorienting. What was the agent doing? Which files did it touch? What's the current state of this branch? Multiply that by four features and you've lost 30 minutes just context-switching.

I was spending more time managing the agents than the agents were spending coding.

## The insight: each feature needs its own world

The fix was obvious in hindsight. Each feature needs complete isolation — not just a branch, but its own filesystem, its own agent session, its own lifecycle. And someone (or something) needs to handle the boring parts: creating the worktree, committing, pushing, opening PRs, watching CI, retrying when things fail.

That "something" is Shep.

## How Shep works

The core concept is simple. When you say:

```bash
shep feat new "add stripe payments" --push --pr
```

Shep does this:

1. Creates a git worktree (a real, lightweight checkout — not a clone, not a container)
2. Spawns your AI coding agent in that worktree's directory
3. Passes your feature description to the agent
4. When the agent finishes, commits the changes
5. Pushes to a remote branch
6. Opens a pull request
7. Watches CI — if it fails, feeds the logs back to the agent and retries (up to 3 times, configurable)

Now do that three more times:

```bash
shep feat new "add dark mode toggle" --push --pr
shep feat new "fix login redirect bug" --push --pr
shep feat new "add checkout regression test" --push --pr
```

Four features. Four agents. Four worktrees. All running at the same time. Zero branch conflicts. You monitor everything from one dashboard at `localhost:4050` — or the terminal, if that's your style.

The result: what took an hour sequentially finishes in about 17 minutes. We benchmarked it — [3-5x wall-clock speedup](https://github.com/shep-ai/shep/blob/main/docs/content/speed-benchmark.md) from parallelism alone on 5 concurrent features. When you factor in the automated git operations, CI monitoring, and eliminated context switching, the effective speedup approaches 5-8x for a typical feature sprint.

## Technical decisions worth explaining

A few choices we made that might be interesting:

### Worktrees, not containers

Git worktrees are criminally underused. A worktree is a lightweight checkout of your repo at a specific branch — it shares the `.git` directory with your main checkout, so there's no clone overhead. The agent has full filesystem access, can use every tool in your PATH, and the worktree is just a normal directory you can open in your IDE.

The tradeoff: because worktrees share `.git`, concurrent git operations need coordination. Shep handles this with operation queuing — only one worktree writes to the shared git state at a time. In practice, the bottleneck is always the agent's coding time, not the git operations.

### Agent-agnostic

Shep doesn't wrap or proxy your AI agent. It spawns whatever CLI agent you've configured — Claude Code, Cursor CLI, or Gemini CLI — and communicates through the agent's native protocol. Swapping agents is a one-line config change: `shep settings agent`.

This was a deliberate choice. The agent ecosystem is moving fast. Betting on one provider means you're locked in when a better option appears next month. Shep is the orchestration layer; your agent does the thinking.

### The CI watch loop

This is the part that makes "prompt to PR" actually work in practice. Most first-pass implementations fail CI. The agent writes code that works in isolation but breaks a linter rule, misses a type, or doesn't match an existing test pattern.

After pushing, Shep polls your CI via the GitHub API. If it fails, Shep reads the logs, feeds them back to the agent with a prompt like "CI failed with these errors — fix and I'll push again," and retries. Three rounds of this fixes the vast majority of CI failures without human intervention.

You can configure the retry count, or turn CI watch off entirely. Some people prefer to review CI failures themselves. That's fine — Shep pauses and notifies you.

### Everything configurable, nothing mandatory

Every step in the pipeline is optional:

```bash
# Minimal: just code in a worktree
shep feat new "add payments"

# Full automation: code, commit, push, PR, watch CI, merge
shep feat new "add payments" --allow-all

# Somewhere in between
shep feat new "add payments" --push --pr
```

We learned early that developers want control. Some are comfortable with full automation. Others want to review every PR manually. Shep doesn't have an opinion about your workflow — it supports all of them.

## What Shep is NOT

Transparency matters, so here's what Shep doesn't do:

- **Shep is not a security scanner.** If your CI doesn't catch a vulnerability, Shep won't either.
- **Shep is not a CI replacement.** Your tests, linters, and security scanners still run. Shep just monitors the results.
- **Shep is not a code editor.** Your agent writes the code. Shep manages the workflow around it.
- **Shep is not a replacement for code review.** PRs are created as drafts. Your review process still applies.

Think of Shep as a project manager for your AI agents. It keeps them organized, handles the logistics, and stays out of the way when things are working.

## Real numbers

Some honest metrics from our own usage:

- **185+ releases** since the first commit. We ship multiple times per week.
- **3-5x measured speedup** on 5 concurrent features (parallelism only, [methodology published](https://github.com/shep-ai/shep/blob/main/docs/content/speed-benchmark.md)).
- **~17 minutes** wall-clock to complete 5 independent features that would take ~54 minutes sequentially.
- **3 agents supported** — Claude Code, Cursor CLI, Gemini CLI.
- **100% local** — all data in `~/.shep/` as SQLite. No cloud, no account, no tracking.
- **MIT licensed** — fork it, extend it, build on it.

We use Shep to build Shep. Most PRs in the repo were created by Shep-orchestrated agent sessions. That's the best validation we can offer — we trust it with our own codebase, every day.

## Before and after

**Before Shep** (5 features, sequential):

1. Create branch manually, start agent (~2 min setup each)
2. Wait for agent to finish (~10-15 min each)
3. Review, commit, push manually (~3-5 min each)
4. Watch CI, diagnose failures, tell agent to fix (~5-15 min each)
5. Open PR manually
6. Repeat for next feature
7. Total: ~2-3 hours with context switching overhead

**With Shep** (5 features, parallel):

1. Run 5 `shep feat new` commands (~30 seconds total)
2. Check dashboard occasionally (~2 min total)
3. Review 5 PRs when they're ready (~15 min)
4. Total: ~30 minutes of active time, ~17 min wall-clock for agent work

The biggest win isn't the parallelism — it's the elimination of all the manual workflow work that adds up across features.

## What's next

We're focused on three things:

1. **Claude Code plugin marketplace** — a lightweight set of developer skills you can use inside Claude Code sessions without installing the full CLI. Architecture review, diagramming, React best practices — available as a plugin.

2. **Multi-repo orchestration** — running features across multiple repositories simultaneously (frontend + backend + shared library). This already works in the CLI: `shep feat new "add payments" --repo ~/backend`.

3. **Better spec-driven development** — for complex features, Shep can run a full pipeline with requirements, research, planning, and approval gates before any code is written. We're making this smoother and more useful based on daily usage.

## Try it

```bash
# One command. Takes about 10 seconds.
npx @shepai/cli

# Start Shep in any git repo
cd ~/projects/my-app
shep

# Launch your first parallel features
shep feat new "add a /health endpoint" --push --pr
shep feat new "add rate limiting middleware" --push --pr
```

Shep is open source, MIT licensed, and runs entirely on your machine. The repo is at [github.com/shep-ai/shep](https://github.com/shep-ai/shep). Stars appreciated, issues and PRs welcome.

If you're already using AI coding agents and feel the workflow pain of managing multiple sessions — give Shep a try. If something doesn't work, [open an issue](https://github.com/shep-ai/shep/issues). We fix things fast.

---

*Published on [shep.bot](https://shep.bot). Shep is an open-source, MIT-licensed project maintained at [github.com/shep-ai/shep](https://github.com/shep-ai/shep).*
