# Slack fixtures

Answers shaped like Slack's own, copied from the examples in Slack's documentation (fetched
from docs.slack.dev on 2026-11-14) with ids and text changed to one story: Dana's `#bugs`
message about checkout on Safari, handed to Shep with `:sheep:`.

| File                                                     | Shaped after                                                                                                                     |
| -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `auth_test.json`                                         | [auth.test](https://docs.slack.dev/reference/methods/auth.test), "Success response when using a bot user token"                  |
| `error_invalid_auth.json`                                | auth.test, "Standard failure response when used with an invalid token"                                                           |
| `apps_connections_open.json`                             | [apps.connections.open](https://docs.slack.dev/reference/methods/apps.connections.open)                                          |
| `conversations_replies.json`                             | [conversations.replies](https://docs.slack.dev/reference/methods/conversations.replies)                                          |
| `conversations_history_*.json`                           | [conversations.history](https://docs.slack.dev/reference/methods/conversations.history)                                          |
| `users_conversations.json`                               | [users.conversations](https://docs.slack.dev/reference/methods/users.conversations)                                              |
| `chat_getPermalink.json`, `chat_getPermalink_reply.json` | [chat.getPermalink](https://docs.slack.dev/reference/methods/chat.getPermalink), plain and threaded                              |
| `chat_postMessage.json`                                  | [chat.postMessage](https://docs.slack.dev/reference/methods/chat.postMessage)                                                    |
| `chat_postEphemeral.json`                                | [chat.postEphemeral](https://docs.slack.dev/reference/methods/chat.postEphemeral)                                                |
| `files_getUploadURLExternal.json`                        | [files.getUploadURLExternal](https://docs.slack.dev/reference/methods/files.getUploadURLExternal)                                |
| `files_completeUploadExternal.json`                      | [files.completeUploadExternal](https://docs.slack.dev/reference/methods/files.completeUploadExternal)                            |
| `socket_hello.json`, `socket_disconnect.json`            | [Using Socket Mode](https://docs.slack.dev/apis/events-api/using-socket-mode): hello, `refresh_requested`                        |
| `socket_reaction_added.json`                             | Socket Mode envelope around [reaction_added](https://docs.slack.dev/reference/events/reaction_added)                             |
| `socket_app_mention.json`                                | Socket Mode envelope around [app_mention](https://docs.slack.dev/reference/events/app_mention)                                   |
| `socket_block_actions.json`                              | Socket Mode "Block Kit buttons" and [block_actions](https://docs.slack.dev/reference/interaction-payloads/block_actions-payload) |

Not from the docs, and to be checked against a live workspace:

- `retry_attempt` / `retry_reason` on the events envelopes (seen in Slack's SDKs, not in the
  Socket Mode guide's example).
- `thread_ts` on the `app_mention` event and in a button's `container`: the docs' examples are
  top-level messages. Shep does not rely on the container; its buttons carry their thread in
  `value`.
- The bot's own posts carrying both `user` (the bot user) and `bot_id`; Shep filters on both.
