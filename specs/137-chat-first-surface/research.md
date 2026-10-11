## Technology Decisions

See `decisions` above. In short:

1. **Emission** — `PostChatBlockUseCase` behind `shep chat block` (CLI, works in every
   interactive session today) and `post_chat_block` (MCP on `shep mcp`). Interactive sessions
   cannot mount MCP: the Claude Agent SDK V2 session (0.2.81) hard-codes `mcpServers: {}`, and
   0.3.x drops the V2 API.
2. **Storage** — blocks and answers are chat messages with `{{block}}` / `{{block-response}}`
   markers; no migration.
3. **Answer path** — a readable user message to the agent (T3's `message` capability).
4. **Cross-process delivery** — SSE route relays newer rows every 1.5 s; client dedupes by id.
5. **HTML sandbox** — opaque-origin iframe + injected network-blocking CSP + height via
   source-checked `postMessage`; shared with the existing Markdown ```html preview.
6. **Page** — `/chats/[scope]` with a conversation rail.

## Security Considerations

- Agent HTML never shares the app origin (`sandbox` without `allow-same-origin`), cannot open
  popups or submit forms to the app, and cannot reach the network (CSP `default-src 'none'`).
- The height message is accepted only from the frame's own `contentWindow` and is clamped.
- Block content is rendered as Markdown through `react-markdown` (no raw HTML), as chat prose is.
- `post_chat_block` and the CLI validate scope keys against the known shapes and cap sizes;
  the response route checks the action is allowed for the block type and that the block
  exists in that scope.

## Performance Implications

- One indexed SQLite read per open chat every 1.5 s; nothing when no chat is open.
- Size caps bound the chat-state payload.
- The conversation rail is a single server read on navigation.
