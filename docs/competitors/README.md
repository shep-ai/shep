# Competitive Landscape

> How Shep AI fits into the AI-powered development tool ecosystem.

The AI coding landscape is evolving fast. This directory profiles the tools we respect and learn from — organized by how they approach the problem.

---

## The Autonomy Spectrum

Steve Yegge's [Developer-Agent Evolution Model](https://steve-yegge.medium.com/welcome-to-gas-town-4f25ee16dd04) describes 8 stages of how developers adopt AI agents:

| Stage | Name                         | What It Looks Like                                |
| ----- | ---------------------------- | ------------------------------------------------- |
| 1     | Near-Zero AI                 | Maybe code completions, sometimes ask Chat        |
| 2     | Agent in IDE, permissions on | Sidebar agent asks to run each tool               |
| 3     | Agent in IDE, YOLO mode      | Permissions off, agent gets wider latitude        |
| 4     | Wide agent in IDE            | Agent fills the screen, code is just diffs        |
| 5     | CLI, single agent, YOLO      | Diffs scroll by, you may or may not look          |
| 6     | CLI, multi-agent, YOLO       | 3-5 parallel instances, you are very fast         |
| 7     | Hand-managed fleet           | 10+ agents, pushing the limits of hand-management |
| 8     | Custom orchestrator          | You build your own orchestration layer            |

**Shep operates at Stage 8** — a custom orchestrator that manages the full lifecycle from requirements to merged PR, with structured approval gates and parallel worktree isolation.

---

## Where Shep Fits

Most tools focus on one slice of development. Shep covers the full lifecycle:

```
Idea → Requirements → Research → Plan → Code → Tests → PR → CI → Merge
       ▲ PRD gate              ▲ Plan gate            ▲ Merge gate
```

| Capability                      | Shep                                | Closest Alternative                                |
| ------------------------------- | ----------------------------------- | -------------------------------------------------- |
| Requirements gathering (PRD)    | Built-in                            | Kiro (design docs), GitHub Spec Kit (static specs) |
| Technical research phase        | Built-in                            | None — most skip this                              |
| Implementation planning         | Built-in, reviewable                | Kiro (tasks.md), Spec Kitty (work packages)        |
| Autonomous implementation       | Yes                                 | Devin, Factory, OpenHands                          |
| CI fix loop                     | Yes, automatic                      | Factory (partial)                                  |
| Human approval gates            | 3 configurable gates                | Kiro (steering), Cline (per-action)                |
| Parallel features via worktrees | Yes                                 | Auto-Claude, Windsurf (Wave 13)                    |
| Open source CLI                 | Yes (MIT)                           | OpenCode, Aider, Cline, Spec Kitty                 |
| Web dashboard                   | Yes (React Flow)                    | Auto-Claude (Electron), Spec Kitty (kanban)        |
| Agent-agnostic | Claude Code, Cursor CLI, Gemini CLI, Codex CLI | Spec Kitty (multi-agent), Gas Town (Claude only)   |

---

## Competitor Profiles

### Full SDLC Platforms

| Tool                                  | What It Does                                                    | Profile                    |
| ------------------------------------- | --------------------------------------------------------------- | -------------------------- |
| [Kiro](./kiro.md)                     | AWS-backed spec-driven IDE with requirements, design, and tasks | Most direct competitor     |
| [Devin](./devin.md)                   | Autonomous AI software engineer by Cognition                    | First-mover, $500/mo       |
| [Factory](./factory.md)               | Agent-native development platform with Droids                   | Enterprise multi-surface   |
| [GitHub Copilot](./github-copilot.md) | Workspace + Coding Agent + Spec Kit                             | Deepest GitHub integration |

### Open Source CLI Tools

| Tool                            | What It Does                                           | Profile                   |
| ------------------------------- | ------------------------------------------------------ | ------------------------- |
| [Auto-Claude](./auto-claude.md) | Multi-session Claude orchestrator with parallel agents | Closest UX overlap        |
| [Spec Kitty](./spec-kitty.md)   | Spec-driven development CLI with kanban dashboard      | Closest workflow overlap  |
| [Gas Town](./gastown.md)        | Steve Yegge's multi-agent fleet orchestrator           | Frontier experimentation  |
| [OpenHands](./openhands.md)     | Composable AI agent platform (formerly OpenDevin)      | Largest open-source agent |
| [OpenCode](./opencode.md)       | Terminal AI coding agent with 120K+ stars              | Biggest community         |
| [MiMo Code](./mimo-code.md)     | Xiaomi's terminal coding agent, OpenCode fork with cross-session memory | OpenCode-shaped, MIT |
| [Aider](./aider.md)             | AI pair programming in the terminal                    | Git-first pioneer         |
| [Cline](./cline.md)             | VS Code agent with plan/act modes                      | 4M+ installs              |
| [Codex](./codex.md) | OpenAI's terminal coding agent | OpenAI ecosystem |

### App Builders (Adjacent)

These target a different audience (non-developers, rapid prototyping) but share the "describe it, get it built" philosophy:

| Tool                               | Tagline                                         |
| ---------------------------------- | ----------------------------------------------- |
| [Lovable](https://lovable.dev)     | Build apps by chatting — $100M ARR in 8 months  |
| [Bolt.new](https://bolt.new)       | Full-stack app generation in the browser        |
| [v0](https://v0.dev)               | Vercel's AI app builder trained on React/shadcn |
| [Replit Agent](https://replit.com) | Prompt to deployed app with hosting             |

---

## What We Learned

Every tool in this space taught us something:

- **Kiro** validated spec-driven development as a category
- **Devin** proved developers want true autonomy, not just suggestions
- **Gas Town** showed that parallel agent orchestration is the frontier
- **Aider** demonstrated that git-first design matters
- **Spec Kitty** confirmed that structured workflows beat ad-hoc prompting
- **MiMo Code** showed that OpenCode forks can specialize on memory and voice without rewriting the agent loop
- **OpenHands** showed the power of an open-source community around autonomous agents

We built Shep to combine these insights: spec-driven lifecycle, parallel worktree isolation, configurable approval gates, agent-agnostic design, and a visual dashboard — all in one open-source CLI.

---

_Last updated: March 2026_
