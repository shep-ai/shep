## Status

- **Phase:** Research
- **Updated:** 2026-10-24

Tool calls are persisted as assistant rows `**label** \`detail\`` and chat blocks with a
`{{block}}` prefix (`chatMessageDisplayText` turns them into titles). Answers to the agent's
AskUserQuestion are keyed by question text, as the web's `answersByQuestionText` does.
