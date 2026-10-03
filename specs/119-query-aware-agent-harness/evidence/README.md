# Evidence: query-aware agent harness (spec 119)

Everything here was produced from this branch.

## Animations

| File | Shows |
| ---- | ----- |
| `harness-walkthrough.gif` | 44-second captioned tour of the web UI: new task, approvals, a session, per-turn context plans, "Why?", the chunk viewer at short/long/full, evals, and open-source settings. Playwright drove the built Storybook, so the clicks hit the real components with fixture data |
| `harness-cli.gif` | `cli-session.txt` replayed as a terminal: `init`, a standalone `run`, `ls` and `policies`. The output is real; the typing is simulated |
| `token-savings.gif` | The two paired evals below, as an animated bar chart drawn from `evals/paired-*.json` |

## Screenshots

Taken from the built Storybook with Playwright and fixture data. Real servers are not involved.

| File | Shows |
| ---- | ----- |
| `harness-settings.png` | Settings → Agent Harness on a fully open-source stack: Ollama backend plus an OpenAI-compatible relevance scorer |
| `harness-page-sessions.png`, `harness-page-approvals.png` | /harness: the sessions list and the approvals inbox |
| `permission-prompt-feature.png`, `permission-prompt-hard-deny.png` | Effect-oriented permission prompt; a hard deny is never approvable |
| `session-waiting-for-approval.png` | A session: the pending approval first, then usage, turns and the selected turn's context plan |
| `context-plan-per-turn.png` | "What the model saw" on one turn: visibility, tokens shown/raw, relevance, reason, source |
| `why-drawer.png`, `chunk-viewer.png` | "Why?" (relevance on the bands, provider, include from next turn), and a chunk at short/long/full |
| `evals-baseline-vs-query-aware.png` | The Evals tab; its numbers are the long-output paired eval below |
| `tools-and-policies.png`, `repository-setup.png` | The tiered tool catalog and policy rules; repository setup preview |

## CLI

`cli-session.txt` was captured in a throwaway repository:

- `harness --help`;
- `init --yes`, which detects CLAUDE.md, the test and lint commands and `.env`;
- a standalone `run` in its own worktree, using the scripted model because this sandbox has no API key;
- `ls`, `capabilities`, `policies` and `eval ls`.

## Component evals (`evals/*.json`)

These run in CI with no network and the deterministic provider.

| Suite | Result |
| ----- | ------ |
| permission (actions → allow/ask/deny) | 60/60 |
| capability routing (intent → capability) | 32/32 |
| context relevance: needed chunks visible | 33/33 |
| context relevance: distractors not shown in full | 29/29 |
| instruction resolution | 11/11 |

The evals found three real problems, all fixed in this PR:

- `gh pr create` was asked about instead of denied.
- Lexical routing scored 24/32 because of stopwords, no stemming and no camelCase splitting.
- A model-supplied `run_tests` filter reached the shell unchecked.

## Paired evals (`evals/paired-*.json`)

These come from `tests/integration/application/use-cases/harness/paired-eval.test.ts`. A **scripted
agent** performs the same actions in both modes. This measures what each mode *sends* to the model,
not model quality; a real-model run is `shep harness eval run smoke` with a backend key.

| Case | Success (B / QA) | Input tokens (B → QA) | Turns |
| ---- | ---------------- | --------------------- | ----- |
| smoke: 3 small Node tasks | 100% / 100% | 4,729 → 5,212 (**+10%**) | 4 / 4 |
| long-output: triage a 2,500-line build log | 100% / 100% | 54,825 → 13,532 (**−75%**) | 7 / 7 |

Query-aware does not win everywhere. On tiny tasks its larger system prompt (rules plus the
capability catalog) costs more than the transcript it saves. The saving appears when tool output
is large, which is the long-task case the harness targets.

Earlier versions of this measurement were worse. These fixes came out of it:

- **Token counting.** The estimate left out tool schemas.
- **Turns.** Tiered loading cost an extra turn on each tool's first use. `use_capability` now takes `args` and calls the tool in the same turn.
- **Size cap.** A relevant 2,500-line log was shown in full on every turn. There is now a `fullTokenCap`, and long views are bounded and ranked.

## Verification run locally

- `pnpm lint`, `pnpm format:check`, `pnpm typecheck` (core and web): clean.
  `packages/electron` cannot typecheck here because its dependencies cannot be downloaded in this container.
- `pnpm test:unit`: 1,161 files and 13,750 tests passed.
- `pnpm test:int`: 173 of 174 files passed.
  `tests/integration/security/dependency-path-traversal.test.ts` cannot load here: it requires the `electron` package, which this container cannot install (403 on download). CI installs it.
- `pnpm build`, `pnpm build:web` and `pnpm build:storybook` all succeed. `pnpm check:stories` passes.
