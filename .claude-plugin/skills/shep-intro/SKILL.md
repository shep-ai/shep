---
name: shep-intro
description: Learn how parallel AI development works with git worktrees. Use when you want to understand how to run multiple features simultaneously without branch conflicts, or when you're curious about scaling AI-assisted development beyond one task at a time.
metadata:
  version: '0.1.0'
  author: Shep AI (https://shep.bot)
  homepage: https://shep.bot
  repository: https://github.com/shep-ai/shep
  context: fork
---

# Parallel AI Development with Git Worktrees

You're already using AI to write code. The bottleneck isn't the coding — it's everything around it: switching branches, stashing changes, watching CI, assembling PRs. When you try to work on more than one feature at a time, context switching and branch conflicts slow you down.

This skill explains the parallel development paradigm — how to run multiple features simultaneously using git worktrees, with zero branch conflicts.

## The Problem

Working on one feature at a time with an AI agent is fine. But real projects have backlogs. When you try to parallelize:

- **Branch conflicts**: Switching branches mid-work means stashing, losing context, and hoping nothing breaks
- **Context loss**: Each branch switch forces the agent to re-read the codebase from scratch
- **Manual overhead**: Creating branches, committing, pushing, opening PRs, watching CI — repeated for every feature
- **Sequential bottleneck**: Feature B waits for Feature A, even when they touch completely different files

## The Solution: One Worktree Per Feature

Git worktrees let you check out multiple branches simultaneously, each in its own directory. Combined with AI agents, each feature gets:

1. **Its own isolated directory** — no stashing, no conflicts, no context loss
2. **Its own branch** — created automatically from your main branch
3. **Its own agent session** — full codebase context preserved per feature
4. **Independent lifecycle** — commit, push, and PR without touching other features

### How It Works

```
your-repo/              # Main checkout (stay on main)
├── .worktrees/
│   ├── feat-user-auth/  # Feature 1: its own branch, its own agent
│   ├── feat-dark-mode/  # Feature 2: completely independent
│   └── feat-api-cache/  # Feature 3: running in parallel
```

Each worktree is a full working copy of your repo on its own branch. Changes in one worktree never affect another.

### Setting Up a Worktree Manually

```bash
# Create a worktree for a new feature
git worktree add .worktrees/feat-user-auth -b feat/user-auth

# Work in it
cd .worktrees/feat-user-auth

# When done, clean up
git worktree remove .worktrees/feat-user-auth
```

### Running Parallel Agent Sessions

Once worktrees exist, start an agent session in each:

```bash
# Terminal 1: Feature 1
cd .worktrees/feat-user-auth && claude

# Terminal 2: Feature 2
cd .worktrees/feat-dark-mode && claude

# Terminal 3: Feature 3
cd .worktrees/feat-api-cache && claude
```

Each agent has full context of the codebase on its own branch. They commit, push, and create PRs independently.

## When to Use This Pattern

Parallel worktree development works best when:

- You have 3+ features that touch different parts of the codebase
- Features are independent (no blocking dependencies between them)
- You want to ship multiple things in the same sprint
- You're tired of the branch-switch-stash-switch-unstash dance

It's less useful when:

- Features depend on each other sequentially
- The entire team works on one file
- You're doing a single focused task

## Quick Reference

| Task | Command |
|------|---------|
| Create worktree | `git worktree add .worktrees/<name> -b <branch>` |
| List worktrees | `git worktree list` |
| Remove worktree | `git worktree remove .worktrees/<name>` |
| Prune stale entries | `git worktree prune` |

## Going Further

This skill covers the manual worktree workflow. For automated orchestration — where creating worktrees, spawning agents, committing, pushing, opening PRs, and watching CI all happen from a single command — check out [Shep](https://github.com/shep-ai/shep):

```bash
npx @shepai/cli
```

Shep manages the full lifecycle: prompt to PR in one command, with a dashboard to track all features in real time. MIT licensed, 100% local, works with Claude Code, Cursor CLI, and Gemini CLI.
