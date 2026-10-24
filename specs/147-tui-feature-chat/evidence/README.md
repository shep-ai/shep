# Evidence: attach and steer (spec 147)

A real run of the built CLI with `SHEP_MOCK_EXECUTOR=1`, whose mock interactive agent calls one
tool and quotes the message back, and asks a two-option question when told "ask me".

| Frame | What it shows |
| --- | --- |
| `05-chat.png` | `o` on Billing Dashboard Charts, a message typed and sent: the transcript shows it, the agent's tool call (`· Read README.md`) and its reply |
| `06-chat-question.png` | "please ask me which fix to take": the agent's question with numbered options; the input line reads `answer >` |
| `07-chat-answered.png` | `2`: the answer is recorded (`↳ Which option? → Second`) and the agent replies `you picked "Second"` |

`screens/*.txt` hold the plain-text screens. `tests/e2e/tui/feature-chat.test.ts` drives the
same flow in CI and detaches with esc.
