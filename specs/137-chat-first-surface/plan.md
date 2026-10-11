## Architecture

```
agent (any provider)                         person
   │ shell: shep chat block plan --file …        │ clicks Approve / Refine …
   │ MCP:   post_chat_block {scope, …}           ▼
   ▼                                     POST /api/interactive/chat/<scope>/blocks/<id>/respond
PostChatBlockUseCase ──► interactive_messages        │
   (domain codec:        `{{block}}{json}`           ▼
    validate, caps)                       RespondToChatBlockUseCase
                                             ├─ stores `{{block-response}}{json}`
                                             └─ sendUserMessage(readable sentence) ──► agent
SSE /chat/<scope>/stream
   ├─ in-process subscriber (existing)
   └─ every 1.5 s ListChatMessagesSinceUseCase ──► `message` events (client dedupes by id)

web: message content ──parseChatBlockMessage──► InlineBlockView (registry)
     SpecReviewBlock | HtmlPreviewBlock(SandboxedHtmlFrame) | PlanCardBlock
/chats/[scope]: ConversationRail (ListChatConversationsUseCase) + ChatTab
```

## Strategy

1. **Model first.** `ChatBlockType` (spec_review, html_preview, plan_card), `ChatBlockAction`
   (approve, request_changes, implement, refine), `ChatBlock`, `ChatBlockResponse` in TypeSpec;
   `InlineBlockType` gains the three block members so the total registry forces a renderer.
2. **Domain codec** in `domain/shared/chat-block.ts`, pure and shared by core and web:
   `chatBlockFromInput` (validation and caps), `format/parseChatBlockMessage`,
   `format/parseChatBlockResponseMessage`, `allowedChatBlockActions(type)`,
   `chatBlockResponseSentence` (what the agent reads), `resolveChatBlockResponses(messages)`.
   `domain/shared/chat-scope.ts` names the scope shapes (`global`, `repo-`, `app-`, uuid) and
   the `SHEP_CHAT_SCOPE` variable.
3. **Use cases** inject `IInteractiveMessageRepository` and `IInteractiveSessionService` by
   token. List-since gets a new repository method (indexed query). Conversations reads
   repositories, features and applications through their repositories.
4. **Adapters**: the `shep chat block` command and the `post_chat_block` MCP tool are thin;
   the bootstrapper adds `SHEP_CHAT_SCOPE` to every session's environment; the chat context
   adds a "Rich replies" section.
5. **Web transport**: the stream route relays newer rows; a respond route resolves the use
   case by string token; `useChatRuntime` exposes `respondToBlock`.
6. **Blocks**: `SandboxedHtmlFrame` (shared with the existing Markdown ```html preview),
   `SpecReviewBlock`, `HtmlPreviewBlock`, `PlanCardBlock`, registered in the inline registry
   and rendered from both chat renderers. Response rows render as compact resolution rows.
7. **Page**: `/chats` → `/chats/global`; `/chats/[scope]` server page loads conversations,
   client renders `ChatsPage` (rail + `ChatTab`). Sidebar link under Home.

## Testing Strategy

- **Unit (RED first)**: codec round trips, validation errors and caps, action rules, response
  folding, sentence wording; each use case with in-memory doubles; CLI command (file/content,
  scope from env, errors); MCP tool (delegation, error result); bootstrapper env; context
  section; sidebar link; stream relay; every component (render, actions, resolved state,
  sandbox attributes, height message source check).
- **Integration (RED first)**: `findByFeatureIdSince` against migrated SQLite; DI bootstrap
  resolves the new string tokens.
- **Storybook**: stories for every new component, including resolved and dark variants.

## Risks and Mitigations

| Risk | Mitigation |
| ---- | ---------- |
| Agent never discovers the command | Context section with exact syntax; command also in `shep --help` reference already injected |
| HTML preview abused to exfiltrate | Opaque origin + `default-src 'none'` CSP; nothing reachable |
| Large HTML slows chat reloads | Domain caps (256 KiB HTML, 64 KiB Markdown) |
| Polling load | One indexed query per open chat per 1.5 s |
| `shep` not on PATH in a dev install | Context gives the command; agents running from source can call `pnpm dev:cli chat block` (documented) |

## Rollback

No schema change. Reverting the PR leaves `{{block}}` rows that older code renders as plain
text, which is harmless.
