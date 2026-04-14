# Curated List Submissions

Prepared PR content and submission instructions for 7+ curated GitHub lists. Each entry matches the target list's format and uses value-focused positioning from the [positioning guide](./positioning-guide.md).

---

## Submission Tracker

| # | Repository | Method | Status | PR/Issue Link |
|---|-----------|--------|--------|---------------|
| 1 | hesreallyhim/awesome-claude-code | Issue form (web UI) | Pending | — |
| 2 | rohitg00/awesome-claude-code-toolkit | PR | Pending | — |
| 3 | travisvn/awesome-claude-skills | PR | Pending | — |
| 4 | caramaschiHG/awesome-ai-agents-2026 | PR | Pending | — |
| 5 | VoltAgent/awesome-agent-skills | PR | Pending | — |
| 6 | ComposioHQ/awesome-claude-skills | PR | Pending | — |
| 7 | jqueryscript/awesome-claude-code | PR | Pending | — |

---

## 1. hesreallyhim/awesome-claude-code

**Submission method**: Issue form only (no external PRs accepted). Submit via:
https://github.com/hesreallyhim/awesome-claude-code/issues/new?template=recommend-resource.yml

**Category**: Tooling > General

**Recommended fields for the issue form**:

- **Resource name**: Shep
- **Resource URL**: https://github.com/shep-ai/shep
- **Description**: Shep runs each feature in its own git worktree with its own AI agent (Claude Code, Cursor CLI, or Gemini CLI) and handles the workflow: committing, pushing, opening PRs, watching CI, and retrying failures. Run 3-5 features in parallel from one dashboard or the terminal. MIT licensed, 100% local (SQLite in ~/.shep/), agent-agnostic. 185+ releases.

**Note**: The maintainer writes all entry descriptions personally in an editorial voice. The description above is a suggestion for context — the actual entry will be rewritten by the maintainer.

---

## 2. rohitg00/awesome-claude-code-toolkit

**Submission method**: PR (fork, create branch, add table row)

**Category**: Ecosystem section

**Branch name**: `add-shep`

**Table entry to add** (in the Ecosystem section table):

```markdown
| [Shep](https://github.com/shep-ai/shep) | 130+ | Parallel AI agent orchestration — each feature in its own git worktree with auto-commit, CI watch, and PR creation. Works with Claude Code, Cursor CLI, and Gemini CLI |
```

**PR title**: `Add Shep to Ecosystem section`

**PR description**:
```
Adds Shep to the Ecosystem section. Shep is an AI-native SDLC platform that runs
parallel agent sessions in isolated git worktrees. Works with Claude Code, Cursor CLI,
and Gemini CLI. MIT licensed, 100% local, 185+ releases.

- GitHub: https://github.com/shep-ai/shep
- npm: https://www.npmjs.com/package/@shepai/cli
```

---

## 3. travisvn/awesome-claude-skills

**Submission method**: PR (one item only)

**Category**: Community Skills > Tools

**Constraints**:
- Must have 10+ GitHub stars (Shep has 130+, qualifies)
- No AI-generated PR descriptions — write manually
- No SaaS or commercial product funnels
- Frame around the Claude Code plugin, not the full platform

**Entry to add** (in the Tools subsection):

```markdown
- **[shep-ai/shep](https://github.com/shep-ai/shep)** - Developer productivity skills from the Shep SDLC platform — architecture review, diagramming, React best practices, and TypeSpec modeling
```

**PR title**: `Add skill: shep-ai/shep`

**PR description**:
```
Adds the Shep developer productivity skills plugin. Bundles 7 standalone skills for
Claude Code: architecture review (Clean Architecture), Mermaid diagramming, shadcn/ui
component patterns, React/Next.js performance rules, React Flow visualization,
TypeSpec domain modeling, and an intro to parallel AI development with git worktrees.

All skills are instruction-only SKILL.md files — no executable code, no API keys,
no MCP servers. MIT licensed.

GitHub: https://github.com/shep-ai/shep
Plugin location: .claude-plugin/
```

---

## 4. caramaschiHG/awesome-ai-agents-2026

**Submission method**: PR (fork, create branch, add table row in alphabetical order)

**Category**: Coding Agents > Terminal and CLI Agents

**Branch name**: `add-shep`

**Table entry to add** (alphabetical within the section):

```markdown
| [Shep](https://github.com/shep-ai/shep) | Parallel AI agent orchestration. Each feature runs in its own git worktree with auto-commit, CI watch, and PR creation. Agent-agnostic (Claude Code, Cursor CLI, Gemini CLI). | Free, MIT |
```

**PR title**: `Add Shep to Terminal and CLI Agents`

**PR description**:
```
Adds Shep to the Terminal and CLI Agents section. Shep orchestrates parallel AI coding
agents across git worktrees — each feature gets an isolated branch, automatic commits,
CI monitoring, and PR creation. Works with Claude Code, Cursor CLI, and Gemini CLI.

MIT licensed, 100% local, 185+ releases.
GitHub: https://github.com/shep-ai/shep
```

---

## 5. VoltAgent/awesome-agent-skills

**Submission method**: PR

**Category**: Community Skills > Development and Testing

**Constraints**:
- Description must be 10 words or fewer
- Must have real community usage (Shep has 130+ stars, 185+ releases)
- Author/org prefix in the name

**Entry to add**:

```markdown
- **[shep-ai/shep](https://github.com/shep-ai/shep/.claude-plugin)** - Parallel AI development with architecture review and diagramming
```

**PR title**: `Add skill: shep-ai/shep`

**PR description**:
```
Adds the Shep developer productivity skills plugin. Seven standalone skills for
Claude Code: architecture review, Mermaid diagrams, shadcn/ui, React best practices,
React Flow, TypeSpec modeling, and parallel AI development intro.

All instruction-only (SKILL.md files). No executable code. MIT licensed.
130+ GitHub stars, 185+ releases.

GitHub: https://github.com/shep-ai/shep
```

---

## 6. ComposioHQ/awesome-claude-skills

**Submission method**: PR with skill folder + SKILL.md (they host skills in-repo)

**Category**: Development & Code Tools

**Constraints**:
- Skills must be based on real use cases
- Add entry in alphabetical order within category
- PR title: "Add [Skill Name] skill"
- PR description must explain real-world use case

**Since this list hosts skills in-repo**, submit a link-only entry pointing to Shep's plugin:

```markdown
- [Shep Dev Tools](https://github.com/shep-ai/shep/tree/main/.claude-plugin) - Parallel AI development with architecture review, Mermaid diagramming, React best practices, and TypeSpec modeling. *By [@shep-ai](https://github.com/shep-ai)*
```

**PR title**: `Add Shep Dev Tools skill`

**PR description**:
```
Adds the Shep developer productivity skills collection. Bundles 7 standalone Claude Code
skills for working developers:

- Architecture review (Clean Architecture principles)
- Mermaid diagram creation for software documentation
- shadcn/ui component patterns
- React/Next.js performance optimization (57 rules from Vercel)
- React Flow graph visualization
- TypeSpec domain model generation
- Intro to parallel AI development with git worktrees

Real-world use: These skills are extracted from the Shep SDLC platform and used daily
for building production TypeScript/React applications. They work standalone without any
external dependencies.

All instruction-only SKILL.md files. No API keys, no MCP servers, no executable hooks.
MIT licensed. 130+ GitHub stars.
```

---

## 7. jqueryscript/awesome-claude-code

**Submission method**: PR (no formal contribution guidelines)

**Category**: Tools & Utilities

**Entry to add** (Shep has 130+ stars, so use `✨` indicator):

```markdown
- ✨ [**shep**](https://github.com/shep-ai/shep) (130+ stars) - Parallel AI agent orchestration across git worktrees with auto-commit, CI watch, and PR creation. Agent-agnostic (Claude Code, Cursor, Gemini).
```

**PR title**: `Add Shep to Tools & Utilities`

**PR description**:
```
Adds Shep to the Tools & Utilities section. Shep orchestrates parallel AI coding agents
across git worktrees — each feature gets isolated branches, automatic commits, CI
monitoring, and PR creation.

MIT licensed, 100% local, 185+ releases.
GitHub: https://github.com/shep-ai/shep
```

---

## Execution Notes

1. **Priority order**: Lists 2 and 4 first (simplest PR format, no special constraints), then 7, then 3 and 5 (more constraints), then 1 (issue form), then 6 (most complex).

2. **Star count**: Update "130+" to the actual count at time of submission. Check with: `gh api repos/shep-ai/shep --jq '.stargazers_count'`

3. **Timing**: Submit curated list PRs before or in parallel with the HN launch. Curated lists provide passive, sustained discovery independent of any single launch event.

4. **Follow-up**: Check PR status weekly. If a PR is rejected, read the feedback, adjust, and resubmit. Rejection by a few lists is expected — the aggregate reach across all lists is what matters.

5. **Authenticity**: All PR descriptions are written in a factual, non-promotional tone. Claims are backed by verifiable data (star count, release count, MIT license).

---

_All messaging follows the [positioning guide](./positioning-guide.md). Update this document if the guide changes._
