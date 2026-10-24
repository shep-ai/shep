## Problem Statement

claude-squad, agent-deck and `claude attach` let the user drop into an agent and talk to it.
In Shep the background feature worker is headless: it can be steered only at gates (approve,
reject with feedback). The web UI's Chat tab is how a user talks to an agent about a feature
today: it runs an interactive agent in the feature's worktree, persists the transcript, and
relays the agent's questions. The terminal has no way to reach it.

## Success Criteria

- [ ] `o` (and the palette) attaches to the selected feature's chat; esc detaches
- [ ] The transcript shows user and agent messages, tool calls as one muted line, chat blocks
      by their title, and the agent's in-progress text while it streams
- [ ] Enter sends the typed message through the same use case as the web Chat tab; the first
      message boots the agent in the feature's worktree (or the repository before one exists)
- [ ] While the agent works, the status line says so; errors (agent without an interactive
      mode, session limit) appear as a message, never a crash
- [ ] A pending agent question lists its options; `1`-`9` on an empty line answers with that
      option, enter on typed text answers in the user's words; multi-question asks are
      answered one question at a time and sent together
- [ ] When the interactive agent is turned off in settings, the view says so and sends nothing
- [ ] Quitting the console stops every chat session it started (their agents run in its process)
- [ ] Long transcripts render the newest lines; nothing from the agent can inject escapes

## Affected Areas

| Area | Impact | Reasoning |
| ---- | ------ | --------- |
| `tsp/common/enums/feature-chat.tsp` | Low | `FeatureChatEntryKind` |
| `GetFeatureChatUseCase`, `SendFeatureChatMessageUseCase`, `AnswerFeatureChatQuestionUseCase`, `StopFeatureChatsUseCase` | High | Ready-to-render chat for any surface, over the interactive use cases |
| `resolveFeatureDirectory` | Low | Shared by panes and chat |
| `src/presentation/tui/feature-console/chat-view.ts` | High | Transcript, streaming text, question, input |
| Console view, app, palette, keys | Medium | Chat mode, faster polling while attached, stop on quit |
| translations, docs | Low | Nine locales |

## Dependencies

- Interactive session use cases (spec 137 chat-first surface): GetInteractiveChatState,
  SendInteractiveMessage, RespondToInteraction, StopInteractiveSession

## Out of Scope

- Steering the background feature worker mid-phase (it does not read chat messages); gate
  feedback stays `r`
- Chat blocks' actions (approve a plan card from the terminal) — shown by title only
- Model and agent pickers (the chat uses the configured agent)

## Size Estimate

**L** - one enum, four use cases, a new full-screen view mode with streaming, question answering,
process-lifetime cleanup, nine locales and an e2e test.
