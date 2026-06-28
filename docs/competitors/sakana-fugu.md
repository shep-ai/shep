# Sakana Fugu

> Multi-agent orchestration delivered as a single foundation-model API.

|             |                                                                 |
| ----------- | --------------------------------------------------------------- |
| **Website** | [sakana.ai/fugu-release](https://sakana.ai/fugu-release/)       |
| **Paper**   | Trinity (ICLR 2026); Conductor (ICLR 2026) — see Sources below  |
| **By**      | Sakana AI (Japan)                                               |
| **Tagline** | "One model to command them all" — orchestration as one API      |
| **Type**    | Multi-agent orchestration foundation model + OpenAI-compatible API |
| **Pricing** | Subscription tiers + pay-as-you-go for heavier workloads (see product page) |
| **License** | Proprietary product (API access; research papers linked below)  |

---

## What It Does

Sakana Fugu (released June 22, 2026) is a multi-agent system that behaves like a single model. You call one endpoint; Fugu decides whether to answer directly or assemble a team of expert models, handling selection, delegation, verification, and synthesis internally. The approach builds on Sakana AI's ICLR 2026 research on learned orchestration — **Trinity** (evolved LLM coordinator) and the **Conductor** (learning to orchestrate agents in natural language).

At launch, Fugu ships in two variants: **Fugu** (lower latency, everyday coding and chat) and **Fugu Ultra** (deeper agent pool for hard multi-step work). Sakana reports that Fugu Ultra stands shoulder-to-shoulder with leading frontier models such as Anthropic's Fable 5 and Mythos Preview on rigorous engineering, scientific, and reasoning benchmarks in their technical report — without those models being in Fugu's public agent pool.

### Key Features

- **Single API, multi-agent inside** — One OpenAI-compatible endpoint; orchestration complexity stays internal
- **Trinity + Conductor research** — ICLR 2026 papers on learned coordination and natural-language orchestration
- **Swappable agent pool** — Routes across multiple LLM providers; designed to reduce single-vendor dependency
- **Fugu vs Fugu Ultra** — Latency-optimized default vs maximum-quality variant for long-running tasks
- **Real-world beta workloads** — Early users report strong results on code review, security assessment, paper reproduction, and research automation

---

## How Shep Compares

|                       | Sakana Fugu                         | Shep                               |
| --------------------- | ----------------------------------- | ---------------------------------- |
| **Interface**         | Model API (OpenAI-compatible)       | CLI + Web dashboard                |
| **Focus**             | Model-level multi-agent orchestration | Process-level SDLC orchestration |
| **Requirements**      | Prompt / task in API request        | AI-generated PRD                   |
| **Planning**          | Internal delegation (Trinity/Conductor) | Structured plan with approval gate |
| **Approval**          | API consumer controls integration   | Per-phase gates (PRD, Plan, Merge) |
| **Parallel features** | Coordinated expert pool in one call | Git worktree isolation per feature |
| **CI integration**    | Not included (model product)        | Automatic fix loop                 |
| **Dashboard**         | Sakana console / API                | Interactive web graph              |

### What We Respect

Fugu formalizes the planner/executor split at the model layer: one trained orchestrator decides when to delegate, which experts to call, and how to synthesize results. That is credible research turned into a product — especially the emphasis on resilient routing when individual providers restrict access.

### Where Shep Differs

Fugu is a foundation-model orchestration product you integrate via API. Shep is an open-source SDLC platform you run against your repository — requirements, research, plans, worktrees, PRs, and CI repair. Fugu answers "which models should collaborate on this hard task?"; Shep answers "how does this feature get from idea to merged main?"

---

_Sources: [Sakana Fugu release](https://sakana.ai/fugu-release/) (includes Trinity and Conductor ICLR 2026 publication references and benchmark methodology)_
