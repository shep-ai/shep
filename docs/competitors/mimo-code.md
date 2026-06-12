# MiMo Code

> Xiaomi's OpenCode-based terminal coding agent with persistent memory for long-horizon tasks.

|             |                                                                                 |
| ----------- | ------------------------------------------------------------------------------- |
| **GitHub**  | [github.com/XiaomiMiMo/MiMo-Code](https://github.com/XiaomiMiMo/MiMo-Code)      |
| **Tagline** | "An open-source AI coding agent with cross-session memory."                     |
| **Type**    | CLI (TypeScript, OpenCode fork)                                                 |
| **Pricing** | Free (open source)                                                              |
| **License** | MIT                                                                             |

---

## What It Does

MiMo Code is a terminal-native coding assistant from Xiaomi's MiMo team. It reads and writes code, runs commands, manages Git, and uses persistent memory to carry project context across sessions while building on OpenCode's terminal-agent foundation.

### Key Features

- **Published benchmark results** — Xiaomi reports MiMo Code + MiMo-V2.5-Pro at 82% on SWE-bench Verified, 62% on SWE-bench Pro, and 73% on Terminal Bench 2
- **Cross-session memory** — Maintains project memory, checkpoints, scratch notes, and per-task progress logs
- **OpenCode lineage** — Keeps OpenCode's provider, TUI, LSP, MCP, and plugin base while adding Xiaomi-specific orchestration
- **Voice input** — Supports streaming voice input for logged-in MiMo users
- **Multiple agents** — Includes build, plan, and compose modes for coding, analysis, and specs-driven workflows
- **MIT source license** — The GitHub repository ships under MIT, with hosted service and trademark terms documented separately

---

## How Shep Compares

|                       | MiMo Code                  | Shep                   |
| --------------------- | -------------------------- | ---------------------- |
| **Language**          | TypeScript                 | TypeScript             |
| **Interface**         | Terminal TUI               | CLI + Web dashboard    |
| **Requirements**      | Compose workflow           | AI-generated PRD       |
| **Research phase**    | Not highlighted            | Built-in               |
| **Full SDLC**         | Agent loop + workflows     | Requirements → Merge   |
| **Parallel features** | Subagents and Max Mode     | Git worktree isolation |
| **Dashboard**         | Terminal only              | Interactive web graph  |
| **CI fix loop**       | Not highlighted            | Automatic              |

### What We Respect

MiMo Code shows how an OpenCode fork can specialize around long-running state: memory files, checkpoints, task logs, and completion verification all target the point where single-session agents usually lose continuity.

### Where Shep Differs

MiMo Code is strongest as a terminal coding harness. Shep focuses on a broader feature-development lifecycle: requirements, research, parallel isolated implementation, review, CI repair, and merge readiness with a dashboard for tracking the work.

---

_Sources: [GitHub](https://github.com/XiaomiMiMo/MiMo-Code), [MiMo Code blog](https://mimo.xiaomi.com/blog/mimo-code-long-horizon), [MiMo Code product page](https://mimo.xiaomi.com/mimocode), [Hugging Face](https://huggingface.co/XiaomiMiMo/MiMo-V2.5-Pro)_
