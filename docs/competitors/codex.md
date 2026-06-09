# Codex CLI

> OpenAI's terminal-first coding agent for software development workflows.

|             |                                           |
| ----------- | ----------------------------------------- |
| **Website** | https://openai.com                        |
| **GitHub**  | https://github.com/openai/codex           |
| **Tagline** | OpenAI coding agent for the terminal      |
| **Type**    | CLI coding agent                          |
| **Pricing** | Varies by model usage                     |
| **License** | Open source                               |

---

## What It Does

Codex CLI is OpenAI's terminal-based coding agent. It can inspect repositories, modify files, execute commands, and assist with software development tasks directly from the command line.

### Key Features

- Terminal-first workflow
- OpenAI-backed coding agent
- Multiple GPT-5 Codex model variants
- Repository-aware assistance
- Command execution capabilities
- Extensible developer workflow support

---

## How Shep Compares

|                | Codex CLI | Shep |
| -------------- | --------- | ---- |
| Interface | CLI | CLI + Web dashboard |
| Focus | Coding assistance | Full SDLC lifecycle |
| Planning | Task-oriented | Structured planning |
| Requirements | Not included | AI-generated PRDs |
| CI Integration | Limited | Automatic fix loop |
| Approval Gates | User-driven | Multi-stage approvals |

### What We Respect

Codex CLI represents OpenAI's investment in developer tooling and provides a lightweight terminal-first experience that integrates naturally into existing workflows.

### Where Shep Differs

While Codex CLI focuses on coding tasks, Shep manages the entire lifecycle from requirements gathering through planning, implementation, CI validation, and merge approval.

---

## Model Support

Current models supported by Shep's Codex integration include:

- gpt-5.4
- gpt-5.4-mini
- gpt-5.3-codex
- gpt-5.3-codex-spark
- gpt-5.2-codex
- gpt-5.2

(See `CODEX_CLI_MODELS` for the full list.)

---

## Sources

### Product Sources

- https://github.com/openai/codex
- https://openai.com

### Shep Integration Evidence

- `packages/core/src/infrastructure/services/agents/common/executors/codex-cli-executor.service.ts`
- `packages/core/src/infrastructure/services/agents/common/agent-executor-factory.service.ts`
- `packages/core/src/infrastructure/services/tool-installer/tools/codex.json`
- `packages/core/src/infrastructure/services/agents/sessions/codex-cli-session.repository.ts`