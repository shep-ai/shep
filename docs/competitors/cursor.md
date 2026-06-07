# Cursor

> **Cursor 3.7 — Canvas Design Mode** (2026-06-04) adds select-and-annotate UI editing inside agent-generated canvases and exposes an interactive context usage report.

Image asset intentionally omitted for this change.

|             |                                                   |
| ----------- | ------------------------------------------------- |
| **Website** | [cursor.com](https://www.cursor.com)              |
| **By**      | Anysphere                                          |
| **Tagline** | "AI code editor and autonomous coding assistant" |
| **Type**    | IDE + agent-assisted coding                        |
| **Pricing** | Free tier, with paid plans for advanced usage       |
| **License** | Proprietary                                       |

---

## What It Does

Cursor combines an IDE-first workflow with AI agents and model tooling to help developers ship code from a single editing environment. Its recent **Canvas Design Mode** announcement focuses on visual code interactions inside generated UI canvases, and its **Composer** model family (including `composer-1.5` and `composer-2.5`) is positioned as a core part of current context-aware coding workflows.

### Key Features

- **IDE-first experience** — A dedicated desktop interface centered on code editing and visual agent-assisted work.
- **Cursor workflows** — Built-in composition features designed around agent interaction and code context continuity.
- **Token visibility** — Context usage reporting that helps explain AI model spend and behavior.
- **Model family** — Uses the `composer` model line (including `composer-1.5`, `composer-2.5`) for generation tasks.
- **Release momentum** — Maintained as a commercial, actively shipping product.

---

## How Shep Compares

|                        | Cursor                             | Shep                                          |
| ---------------------- | ---------------------------------- | --------------------------------------------- |
| **Interface**          | IDE-first coding environment        | CLI + web dashboard                           |
| **Execution model**    | In-editor coding and agent features | Full SDLC orchestration across PR lifecycle    |
| **Planning**           | Task and session focused            | Structured PRD, research, and plan gates       |
| **Parallel features**  | Per-context coding session          | Worktree isolation for multiple feature streams |
| **CI integration**     | Not built-in                      | Automatic CI watching + fix loop                |
| **Delivery**           | Editor-centered                    | Dashboard + CLI for fleet management            |

### What We Respect

Cursor has pushed practical UI-first agent workflows and made context visibility a first-class control in real engineering work. The Canvas-based tooling helps ground AI coding in concrete, inspectable surfaces, which aligns well with transparent product behavior in a developer setting.

### Where Shep Differs

Cursor is strongest where a single IDE context and fast coding loop are central. Shep is strongest where teams need structured orchestration from problem framing through merge, including explicit review gates and parallel execution across multiple feature worktrees.

---

_Sources: [cursor.com](https://www.cursor.com), [Cursor 3.7 Release Notes](https://www.cursor.com/), [Composer models](https://www.cursor.com/)_
