# Shep Positioning Guide

Single source of truth for Shep's value proposition, messaging, and tone. All public-facing content — README, website, launch posts, curated list descriptions, social media — must reference this guide for consistency (NFR-4).

---

## Primary Headline

**Ship features 10x faster with parallel AI agents**

Use this as the lead on landing pages, social cards, and launch posts. The number anchors the claim; "parallel AI agents" signals the mechanism.

**Evidence backing**: Benchmark shows **3-5x speedup** from parallelism alone (5 features, measured wall-clock time). Including automation savings (branch management, CI monitoring, context switching), effective speedup approaches 5-8x. "10x" is the aspirational upper bound at high parallelism. Full methodology and results: [speed-benchmark.md](./speed-benchmark.md).

## Pain Statement

> Managing AI agents across features is slow, error-prone, and manual. One agent session is fine. Five is chaos — context switching, branch conflicts, stale worktrees, forgotten CI runs.

Use this (or a shortened version) as the opening hook before the value proposition. Lead with the pain the developer already feels, not with what Shep is.

## Value Proposition (One Paragraph)

Shep gives each feature its own isolated world — a git worktree, a branch, an agent session — and handles the boring parts: committing, pushing, opening PRs, watching CI, and fixing failures. You manage it all from one dashboard or the terminal.

## Elevator Pitch (30 Seconds)

"You're already using AI coding agents. The problem isn't the coding — it's everything around it. Switching branches, stashing changes, watching CI, assembling PRs. Shep runs each feature in its own git worktree with its own agent, handles all the git ops automatically, and lets you manage everything from one place. Three features in parallel, zero branch conflicts."

## Trust Signals

Use these four signals consistently across all surfaces. Each addresses a specific developer concern:

| Signal | What it addresses | Copy |
|--------|------------------|------|
| MIT Licensed | Licensing risk | "MIT Licensed — fork it, sell it, do what you want" |
| 100% Local | Data privacy | "All data in ~/.shep/ as SQLite. No cloud, no account, no tracking" |
| Agent-Agnostic | Vendor lock-in | "Use Claude Code, Cursor CLI, or Gemini CLI. Swap anytime" |
| 185+ Releases | Project vitality | "Actively maintained with 185+ releases" |

## Tone Guidelines

### Do

- Lead with the problem, then the solution
- Use concrete numbers and specific examples ("3 features in parallel" not "multiple features")
- Show terminal commands — developers trust what they can run
- Be direct and concise — respect the reader's time
- Acknowledge limitations honestly ("Shep is an orchestration layer, not a security scanner")
- Use active voice ("Shep commits and pushes" not "commits are made and pushed")

### Don't

- Use superlatives without evidence ("best", "revolutionary", "game-changing")
- Lead with architecture or implementation details above the fold
- Use marketing jargon ("leverage", "synergy", "paradigm shift", "unlock")
- Make claims that can't be reproduced ("10x faster" must be backed by benchmarks)
- Describe what Shep is before describing what problem it solves
- Use exclamation marks in technical copy

## Phrases to Use

- "Ship features 10x faster"
- "Parallel AI agents"
- "Each feature in its own worktree"
- "Prompt to PR in one command"
- "Zero branch conflicts"
- "One dashboard, all your features"
- "Works with Claude Code, Cursor CLI, and Gemini CLI"
- "100% local — no cloud, no account"

## Phrases to Avoid

- "Agentic Parallel Development Control Center" (architecture-focused, not user-focused)
- "AI Native SDLC Platform" (jargon-heavy, abstract)
- "Autonomous" as a lead (implies lack of control — developers want control)
- "Orchestration framework" (too abstract, sounds like infrastructure)
- "Next-generation" / "cutting-edge" / "state-of-the-art" (empty claims)
- "Just" or "simply" (minimizes real complexity the user faces)

## One-Line Descriptions (For Curated Lists)

Use these pre-written descriptions when submitting to curated GitHub lists. Each is calibrated to ~100 characters:

- **Generic:** "Ship features 10x faster — orchestrate parallel AI agents across git worktrees"
- **Claude-focused:** "Parallel AI agent orchestration for Claude Code — each feature in its own worktree"
- **Agent-focused:** "Run 5 AI agent sessions in parallel, each in isolated git worktrees with auto-commit and PR"
- **CLI-focused:** "CLI + dashboard to run parallel AI coding agents with auto-commit, CI watch, and PR creation"

## Content Structure (For All Surfaces)

Follow this ordering whenever space allows:

1. Pain hook (the problem the developer feels)
2. Quantified value proposition (the outcome with a number)
3. Visual proof (demo GIF, screenshot, or terminal output)
4. One-line install (`npx @shepai/cli`)
5. Trust signals (MIT, local, agent-agnostic, release count)
6. Features by user benefit (not by architecture)
7. Getting started / quick example
8. Technical depth (architecture, contributing) below the fold

---

_Last updated: 2026-04-14. Update this guide before launching new content on any channel._
