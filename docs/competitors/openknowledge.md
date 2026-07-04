# OpenKnowledge

> Local-first AI markdown wiki — agent-written codebase docs in plain markdown.

|             |                                                                                    |
| ----------- | ---------------------------------------------------------------------------------- |
| **Website** | [openknowledge.ai](https://openknowledge.ai)                                       |
| **GitHub**  | [github.com/inkeep/open-knowledge](https://github.com/inkeep/open-knowledge)       |
| **By**      | Inkeep                                                                             |
| **Tagline** | "Local-first AI markdown wiki"                                                     |
| **Type**    | Local-first markdown editor + AI agent runner                                      |
| **Pricing** | See [openknowledge.ai](https://openknowledge.ai) (product tiers vary by plan)      |
| **License** | GPL                                                                                |

---

## What It Does

OpenKnowledge is a local-first markdown wiki from Inkeep. It stores knowledge as plain markdown files synced via git, runs AI agents against that corpus, and integrates with Claude, Codex, Cursor, and MCP-based agentic search. Version 0.18.0 (June 25, 2026) added a `codebase-wiki` starter pack that scaffolds a `wiki/` folder and an overview hub, then has an agent fill in architecture notes, module descriptions, data flows, and Mermaid diagrams.

### Key Features

- **Local-first storage** — Plain markdown files, private by default, synced through git
- **codebase-wiki starter pack (v0.18.0)** — Scaffolds `wiki/` and an overview hub for agent-written codebase documentation
- **Agent integrations** — Claude, Codex, Cursor, and MCP-based agentic search
- **Architecture output** — Module pages, data-flow notes, and Mermaid diagrams as first-class wiki content
- **Wiki-native workflow** — Optimized for knowledge capture and codebase understanding, not shipping features

---

## How Shep Compares

|                       | OpenKnowledge                          | Shep                               |
| --------------------- | -------------------------------------- | ---------------------------------- |
| **Focus area**        | AI wiki / codebase knowledge base      | Full SDLC lifecycle orchestration  |
| **Primary output**    | Markdown wiki pages in `wiki/`         | PRD, plan, code, tests, merged PR  |
| **Requirements**      | Implicit in wiki structure             | AI-generated PRD with approval gate |
| **Planning**          | Architecture / module documentation    | Structured implementation plan     |
| **Execution**         | Agent fills documentation pages        | Agent implements in isolated worktrees |
| **Lifecycle scope**   | Knowledge & docs adjacent              | Idea → requirements → merge        |
| **Dashboard**         | Wiki editor experience                 | Interactive web graph + CLI        |

### What We Respect

OpenKnowledge treats agent-written codebase documentation as a first-class product surface, not an afterthought. The v0.18.0 `codebase-wiki` flow — scaffold a `wiki/` tree, then let an agent populate architecture and data-flow pages — is a clean pattern for teams that need living docs before they need a full delivery pipeline.

### Where Shep Differs

OpenKnowledge is adjacent, not a direct SDLC competitor. It excels when the job is "help me understand and document this codebase in markdown." Shep excels when the job is "take this feature from idea through requirements, implementation, CI, and merge." The wiki angle complements lifecycle orchestration; they solve different handoffs.

---

_Sources: [OpenKnowledge homepage](https://openknowledge.ai), [GitHub — inkeep/open-knowledge](https://github.com/inkeep/open-knowledge), [v0.18.0 release](https://github.com/inkeep/open-knowledge/releases/tag/v0.18.0)_
