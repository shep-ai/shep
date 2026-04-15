# Chat Component Architecture (STRICT)

These rules govern the `features/chat/` directory. They exist because
the chat UI previously devolved into a chaotic mix of flat bubbles,
competing rendering layers, and stale-query races. Do not break them
without explicit user sign-off.

## The Three Layers

The chat ALWAYS flows through three strictly-ordered layers. Each
layer has one responsibility and does not leak into the others.

```
┌─────────────────────────────────────────────────────────────────┐
│  LAYER 1 — RAW EVENTS (single chronological stream)             │
│                                                                 │
│  The source of truth. Every persisted chat message, tool call,  │
│  system event, and debug event lives here in chronological      │
│  order. Think "operation log" — a single append-only feed.      │
│                                                                 │
│  Primary feed: `rawMessages` exposed by `useChatRuntime` from   │
│  the `interactive_messages` table via the chat-state cache.     │
│  Secondary feeds may extend this: system events, debug bubbles, │
│  tool-call traces. All are tagged and remain chronological.     │
└─────────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│  LAYER 2 — OVERLAY GROUPING LAYER (pure, derivable)             │
│                                                                 │
│  A pure function over the raw event stream that produces a      │
│  list of named groups. Groups are chronological. Each group     │
│  has: id, title, status ('completed' | 'in-progress'), the     │
│  list of raw event ids it owns, and a friendly high-level       │
│  summary.                                                       │
│                                                                 │
│  Primary implementation: `computeTurnGroupsFromMessages()` in   │
│  `turn-group-list.tsx`. Must run SYNCHRONOUSLY on every render  │
│  (via `useTurnGroupsView`) — no async queries, no stale         │
│  windows, no server round-trips for the view. The server-side  │
│  `GetChatTurnGroupsUseCase` mirrors this logic for external    │
│  API consumers (CLI, TUI) but the web MUST compute locally.    │
│                                                                 │
│  Other grouping families (setup workflow, operation bubbles,   │
│  interactions) each have their own pure derivation. They are   │
│  siblings of turn groups in Layer 2, not alternatives.          │
└─────────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│  LAYER 3 — HIGH-LEVEL UI (default view, collapsed, friendly)    │
│                                                                 │
│  Groups render as collapsible cards in a single chronological   │
│  column. DEFAULT state is the friendly high-level summary with  │
│  raw events HIDDEN. The user-facing label is non-technical     │
│  ("Working on: Fix login bug", "Initial setup complete").      │
│                                                                 │
│  Expanding a card reveals its owned raw events inline, in the   │
│  same chronological order the raw stream had them. Nothing      │
│  else changes position — expansion is purely local to the card. │
└─────────────────────────────────────────────────────────────────┘
```

## Mandatory Rules

### 1. Single Chronological Timeline
- The chat is ONE vertical column. No pinned-at-top, no pinned-at-bottom
  sections, no split between `beforeMessages` and `afterMessages` for
  chat content. Groups render in strict chronological order of their
  `startedAt` timestamp, top to bottom.
- The composer is the only exception — it lives outside the timeline
  because it's an input, not a historical event.

### 2. Layer 1 is Never Rendered Directly
- The flat thread (assistant-ui `Thread` message list) is DEAD when
  turn groups are enabled. `useChatRuntime` is called with
  `hideAllMessages: true` and returns `threadMessages: []`.
- Raw bubbles only appear as children of a Layer 3 card.
- Never render a raw message via `<UserMessage>` / `<AssistantMessage>`
  directly in the chat pane.

### 3. Layer 2 is Pure and Synchronous
- Grouping must be a pure function over `rawMessages`. No fetch, no
  `useQuery`, no setTimeout, no event listeners. Use `useMemo`.
- Stale-query races are forbidden. If you feel tempted to add a
  server query to drive the view, you are breaking this rule.
- The server-side grouping use case stays for CLI/API consumers but
  the web UI computes locally — always.

### 4. Default is Collapsed High-Level, Raw Events are Progressive Disclosure
- Completed groups render with an emerald check icon and a friendly
  title. Children (the raw events) are hidden behind a click.
- In-progress groups render expanded with the live streaming
  indicator inside them — the user sees progress as it happens but
  the outer frame is still the high-level card, not a flat list.
- Titles must be non-technical. "Working on: <first line of user
  ask>" is good. "Assistant generating response to message id X" is
  not.

### 5. Optimistic Rendering
- Sending a message must produce a visible in-progress group in the
  same render tick. That means the grouping layer reads from the
  chat-state cache which is mutated optimistically by the send
  mutation — no await, no round-trip.
- The current-turn card updates IN PLACE as new raw events arrive;
  it does not unmount and remount per-event.

### 6. Raw Events May Be Extended (System / Debug / Tool)
- Layer 1 is not restricted to `interactive_messages` rows. System
  announcements, debug events, tool-call metadata, and workflow-step
  events all belong to the same chronological stream.
- When adding a new event source, plumb it into the raw feed in a
  way that preserves chronological order (merge-by-timestamp). Do
  NOT render it as a flat bubble — it must flow through a Layer 2
  grouping and appear inside a Layer 3 card like everything else.

### 7. No Competing Rendering Paths
- One chat pane, one timeline, one composer. If you find yourself
  adding a second rendering surface for chat content (another
  drawer, a secondary list, a parallel component), STOP — it is a
  Layer 3 card that belongs inside the existing timeline.
- `OperationBubble`, `InteractionBubble`, `StepTracker`, and
  `TurnGroupCard` are all Layer 3 card types. Their order in the
  column is chronological.

### 8. File Responsibilities
- `useChatRuntime.ts` — Layer 1 facade. Exposes `rawMessages` and
  `streamingState`. Returns `threadMessages: []` when the host
  enables `hideAllMessages`. Never grows UI concerns.
- `turn-group-list.tsx` — Layer 2 grouping logic + Layer 3 renderers
  for user-turn cards. Pure `computeTurnGroupsFromMessages` is the
  single source of truth for turn derivation.
- `turn-group-card.tsx` — Layer 3 card primitive. Knows nothing
  about messages; takes pre-baked props (`title`, `status`, children).
- `StepTracker.tsx` — Layer 3 card for the setup workflow.
- `operation-bubble.tsx` — Layer 3 card for publish/deploy operations.
- `ChatTab.tsx` — Composes the timeline. Calls `useChatRuntime` once
  with `hideAllMessages: turnGroupsEnabled`, calls `useTurnGroupsView`
  over `rawMessages`, and renders all Layer 3 cards in chronological
  order inside `beforeMessages`. `afterMessages` is only used by
  non-grouping (repo / global) chats.

## What Breaks These Rules (Anti-Patterns)

- Rendering a raw message directly in the chat pane "just for this
  one case"
- Adding a `useQuery` for grouping view data in the web UI
- Pinning a group at the top or bottom regardless of its timestamp
- Letting the flat thread coexist with the grouping overlay — they
  must not both be visible
- Hiding only SOME raw messages from the flat thread (half-open
  overlay) — it's all-or-nothing via `hideAllMessages`
- Introducing a parallel "chat timeline" component that bypasses
  the three-layer flow
- Surfacing technical jargon ("tool call", "step_id", "token count")
  in the default collapsed card title. Raw events may contain it;
  high-level labels must not.

## Extending the Chat

When adding a new feature that touches the chat surface, walk the
layers in order:

1. **Does it add a new kind of raw event?** Plumb it into Layer 1
   via the chat-state cache or a sibling event stream. Ensure
   chronological merging.
2. **Does it need grouping?** Add a pure derivation in Layer 2. No
   async, no query, no stale-prone fetching.
3. **Does it need a new UI card type?** Add a Layer 3 card and
   render it in the `ChatTab` timeline at its chronological
   position.

Never skip a layer. Never render Layer 1 directly. Never let Layer 2
escape into a query. Never let Layer 3 own derivation logic.
