## Problem Statement

Chat exists in Shep only as a secondary surface: a floating popup, a drawer over the canvas,
and a tab inside the feature and repository drawers. There is no page where a person can
simply *talk to Shep*, see every conversation, and move between them. The owner's direction
(N1 in `docs/competitors/t3code.md`) reverses the earlier "keep chat secondary" advice:

- The industry is used to chat, so Shep needs a chat-first surface.
- It must be *advanced* chat: the agent renders real UI inside the conversation — a component
  preview to look at, a question to answer, a PRD to review and approve inline.
- Shep stays an autopilot. The chat is a primary way to start, steer and answer work; it does
  not replace the pipeline that runs features to PRs in worktrees.

Spec 134 built the foundation: one `Decision` model, the `DecisionPanel`, and an
`InlineBlockType`-keyed registry whose total `Record` makes a missing renderer a compile
error. Decision is the only block type, and agents can only reach it through
`AskUserQuestion` / `ask_decision`. There is no way for an agent to *show* something.

Two facts found while researching shape the design:

1. Interactive chat sessions mount no MCP servers. The Claude Agent SDK V2 session hard-codes
   `mcpServers: {}` and `settingSources: []` (0.2.81), and SDK 0.3.x removes the V2 session
   API; Cursor's ACP session sends `mcpServers: []`. A block tool therefore cannot be MCP-only.
2. Every chat agent already has a shell and is given Shep's full CLI reference in its context
   (`FeatureContextBuilder`), and `shep mcp` already serves outside agents. A use case exposed
   through both is agent-agnostic by construction.

## Information Architecture

A chat is keyed by a scope string (the `feature_id` column of `interactive_messages`):

| Scope key        | Conversation        | Agent works in              |
| ---------------- | ------------------- | --------------------------- |
| `global`         | Shep (all repos)    | `SHEP_HOME`                 |
| `repo-<id>`      | A repository        | the repository path         |
| `<feature uuid>` | A feature           | the feature worktree        |
| `app-<id>`       | An application      | the application's repo      |

`/chats` lists them in that order of groups (Shep first, then repositories, features that are
not archived or deleted, applications), each row with the live turn-status dot. `/chats/<scope>`
opens the conversation full height next to the list. The feature row links back to the canvas
(autopilot view), so chat and pipeline stay two views of the same work. The global chat is the
landing conversation: from it the agent starts features (`shep feat new`), which then run on
autopilot and appear in the list.

## Success Criteria

### Surface
- [x] `/chats` and `/chats/[scope]` exist as a top-level page, with a sidebar nav item
      ("Chat") placed directly under Home, in all 9 locales.
- [x] The page shows every conversation grouped as Shep / Repositories / Features /
      Applications with turn-status dots, and the selected conversation full height.
- [x] The page uses the existing `ChatTab` and chat runtime (no second chat implementation).
- [x] Feature conversations show the feature's lifecycle and a link to its canvas drawer.

### Inline blocks
- [x] `InlineBlockType` gains `SpecReview`, `HtmlPreview` and `PlanCard`; the total registry
      renders each.
- [x] Spec review renders a title and Markdown body with **Approve** and **Request changes**
      (the latter takes a note).
- [x] HTML preview renders agent HTML in an iframe with `sandbox="allow-scripts"` (never
      `allow-same-origin`), a CSP that blocks all network access, auto height through a
      source-checked `postMessage`, an expand view and a view-source toggle.
- [x] Plan card renders a title and Markdown plan with **Implement** and **Refine** (the
      latter takes a note), following T3's plan pattern.
- [x] A block that was answered shows its resolution ("Approved", "Changes requested: …",
      "Implementing", "Refining: …") and no longer offers actions — after reload too.
- [x] Blocks render in both chat renderers (flat thread and application turn cards).

### Agent-agnostic emission
- [x] One `PostChatBlockUseCase` validates and stores a block (size caps, allowed types).
- [x] `shep chat block <spec-review|preview|plan> --title … (--file … | --content …)` posts a
      block; the scope defaults to `SHEP_CHAT_SCOPE`, which every interactive session sets.
- [x] `post_chat_block` on the `shep mcp` server posts the same block with an explicit scope.
- [x] Blocks posted from another process (the agent's shell, an MCP server) reach an open chat
      without a reload.
- [x] The chat context tells every agent when and how to use each block.
- [x] Answering a block records the response in the conversation and sends the agent a plain
      message ("The user approved the spec …"), so the answer survives restarts and works for
      every provider (T3's `message` response capability).

### Quality
- [x] TDD for domain, use cases, CLI, MCP tool, routes and components; Storybook stories for
      every new component; `pnpm validate`, unit, integration and Storybook builds green.

## Out of Scope (part 2)

- Wiring a spec-review **Approve** directly to the feature's approval gate (today the agent is
  told and runs `shep feat approve`).
- Mounting `post_chat_block` as MCP inside ACP chat sessions and headless feature runs.
- Coupling Refine/Implement to the composer text (T3's "typed text means Refine").
- Network or asset access for HTML previews (local images, CDNs).
- Telling application chats about rich replies: their first turn is the application brief,
  so the Shep context (and its "Rich replies" section) is not prepended there yet.

## Found while building

- The Claude Agent SDK V2 session drops `systemPrompt`, so a chat booted by the user's first
  message never received the Shep context at all (identity, CLI reference). A new agent
  session now gets the built context ahead of that first message in the same turn.
- The Markdown ```html preview ran agent HTML with network access; it now uses the same
  network-less `SandboxedHtmlFrame` as the HTML preview block.

## Affected Areas

| Area | Impact | Reasoning |
| ---- | ------ | --------- |
| `tsp/ui`, `tsp/agents` | Medium | New block types, `ChatBlock` model and enums |
| `domain/shared` | Medium | Block message codec, validation, response wording |
| `application/use-cases/interactive` | Medium | Post, respond, list-since and list-conversations use cases |
| `infrastructure/services/interactive` | Low | Session env carries `SHEP_CHAT_SCOPE`; context section |
| `infrastructure/services/mcp` | Low | `post_chat_block` tool |
| CLI | Low | `shep chat block` command group |
| Web chat + new page | High | Block renderers, `/chats` page, nav, SSE relay |
| translations | Low | New keys in all 9 locales |

## Dependencies

Builds on spec 134 (Decision model, `DecisionPanel`, inline block registry).

## Size Estimate

**XL** — new domain model, four use cases, two agent-facing adapters, three UI blocks, a page
and nav. No migration: blocks are chat messages.

---

_Generated by `/shep-kit:new-feature` — proceed with `/shep-kit:research`_
