# Twitter/X Launch Thread

5-8 tweet thread for launch day. Schedule for the same day as or day after the HN launch. All messaging follows the [positioning guide](./positioning-guide.md).

---

## Scheduling

- **Timing**: Same day as HN post, 2-3 hours after submission (to reference early traction)
- **Alternative**: Day after HN post, morning US Pacific time
- **Include demo GIF**: Attach to tweet 3 (or embed as video if GIF exceeds Twitter's size limit)

---

## Thread

### Tweet 1 — Hook (value prop)

```
I've been using AI coding agents for a year. One session? Great. Five in parallel? Chaos.

Branch conflicts. CI babysitting. Context switching between worktrees.

I built Shep to fix this: each feature gets its own worktree, its own agent, its own lifecycle.

🧵 Thread:
```

### Tweet 2 — Problem statement

```
The agent isn't the bottleneck. The workflow around it is.

Creating branches, stashing changes, watching CI across 5 PRs, remembering which terminal has which feature.

I was spending more time managing agents than they were spending coding.
```

### Tweet 3 — Demo (attach GIF/video)

```
So I built Shep. One command per feature. All run in parallel.

shep feat new "add payments" --push --pr
shep feat new "add dark mode" --push --pr
shep feat new "fix login bug" --push --pr

Three agents. Three worktrees. Zero conflicts. One dashboard.

[ATTACH: demo GIF or screenshot of parallel features in dashboard]
```

### Tweet 4 — Key differentiators

```
What makes it different:

- Agent-agnostic: Claude Code, Cursor CLI, Gemini CLI. Swap anytime
- CI watch loop: if CI fails, Shep reads the logs, feeds them to the agent, retries automatically
- 100% local: all data in ~/.shep/ as SQLite. No cloud, no account
- MIT licensed
```

### Tweet 5 — Benchmark / social proof

```
Benchmarked: 3-5x wall-clock speedup from parallelism alone on 5 concurrent features.

5 features sequentially: ~54 minutes
5 features with Shep: ~17 minutes

Plus automated git ops, CI monitoring, and zero context switching.

Methodology published in the repo.
```

### Tweet 6 — What Shep is NOT (honesty)

```
What Shep is NOT:

- Not a security scanner
- Not a CI replacement
- Not a code editor

It's an orchestration layer. Your agent codes. Your CI tests. Your review process gatekeeps.

Shep handles the boring parts between "describe the feature" and "merge the PR."
```

### Tweet 7 — CTA

```
Shep is open source, MIT licensed, and 100% local.

Try it in 10 seconds:
npx @shepai/cli

185+ releases. Used daily to build itself.

GitHub: github.com/shep-ai/shep

Stars appreciated, issues welcome. Happy to answer questions in replies.
```

### Tweet 8 (optional) — HN reference

```
Also on Hacker News today if you prefer that format:

[LINK TO HN POST]

Happy to answer any questions about the architecture, the CI watch loop, or how worktree-based parallelism works in practice.
```

---

## Alt versions for tweet 1 (test different hooks)

**Option A** (question hook):
```
What happens when you try to run 5 AI coding agents at the same time?

Branch conflicts. Stale worktrees. Forgotten CI runs. Context switching between terminals.

I built something to fix this. 🧵
```

**Option B** (number hook):
```
5 features. 5 AI agents. 5 git worktrees. All running in parallel.

17 minutes instead of 54.

I built Shep because managing parallel agent sessions was harder than the actual coding. 🧵
```

---

## Engagement strategy

1. **Reply to responses** within the first 2 hours — Twitter engagement is heavily front-loaded
2. **Quote-tweet the hook** with additional context if it gains traction
3. **Tag relevant people** only if they've previously discussed AI coding agents (don't spam)
4. **Pin the thread** to your profile for the week
5. **Cross-link**: Reference the blog post and GitHub repo in replies when relevant

---

_All messaging follows the [positioning guide](./positioning-guide.md). Update this document if the guide changes._
