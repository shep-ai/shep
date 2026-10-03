# Evidence: query-aware agent harness (spec 119)

Everything here was captured from **the real app on this branch**: the production web build (`shep ui`)
and the CLI, against a real SQLite database, real git worktrees and a real model. No Storybook, no
fixtures, no scripted agent in the screenshots or animations.

**Setup.** No API key was available, so the harness ran on the open-source path it supports:
**Qwen3-8B (Q4_K_M) served by llama.cpp** on a shared 4-core CPU, reached through the harness's
Ollama backend, with the deterministic relevance scorer. Configured in Settings → Agent Harness.
A small CPU model is slow (one to three minutes per turn) and makes mistakes; the runs below show
both, and the harness reports failures as failures.

The demo repository is a small Node auth service (`refresh()` accepts expired tokens) with
`CLAUDE.md`, `npm test` and a `.env` file.

## Animations

| File | Shows |
| ---- | ----- |
| `harness-walkthrough.gif` | Captioned 45-second tour of the real web app: settings, sessions, a new task, a **live** permission request approved with one click while the agent waited, a real eval session's per-turn context plans, "Why?", the chunk viewer, and the real Evals tab |
| `harness-cli.gif` | `cli-session.txt` replayed: `init`, a run that asks to `npm install`, answered in the web UI ("Answered in another window"), `apply` to a branch, `ls`. Only the typing is simulated |
| `token-savings.gif` | Input tokens per mode: the two paired evals and the real-model eval below |

## Screenshots

| File | Shows |
| ---- | ----- |
| `settings-open-source-stack.png` | Settings → Agent Harness: Ollama backend, model `qwen3-8b`, the model call timeout added for slow local models |
| `sessions.png` | /harness: every real run, including failures and runs that were stopped |
| `approval-request.png` | A real request: `npm install`, the agent's reason, predicted effects and the matching rules |
| `session-after-approval.png` | The approved run: 2 turns, success, the plan for the last turn |
| `context-plan-13-turn-run.png` | A 13-turn real eval run: per-turn plans with full and long views, tokens shown/raw and reasons |
| `why-drawer.png` | "Why?" for one chunk: relevance on the visibility bands, who decided, the input fingerprint |
| `chunk-viewer-short.png`, `chunk-viewer-full.png` | One stored search result rendered short and full; nothing re-runs |
| `evals-real-model.png` | The Evals tab with the real-model run below |
| `tools-and-policies.png` | The tiered tool catalog and the effective permission rules |

## What the real runs found (all fixed in this PR, each with a test)

Running a real model surfaced problems that scripted tests never hit:

1. `search_source` reported "0 matches" when limited to one file (`rg` drops the file name), so the model kept searching.
2. A task whose process died stayed "running" forever and could not be stopped or discarded. Tasks now record their pid; stop cancels orphans.
3. Agents looped on identical reads. A repeated read with nothing changed returns the earlier result and a nudge; empty searches say how they matched.
4. The model call timeout was fixed at five minutes; slow local models exceeded it. It is now a setting.
5. Loading an already-loaded tool said "loaded" again, so a small model never called it. It now says to call the tool.
6. A tiny output's "long" view was bigger than the output ("tool output seen 116%"). A view that is not smaller now shows the content.
7. **After the agent edited a file, its pre-edit read stayed in context**, so the model saw two versions of the file. Edits now mark earlier reads stale, and full reads supersede each other across excerpts.
8. File names such as `errors.js` were summarized as errors.
9. The CLI permission prompt stayed on screen after the request was answered in the web UI.
10. `shep harness ls` printed short ids that no other command accepted.
11. An eval run whose process exited stayed "Running" in the Evals tab.

## Real-model eval (`evals/real-model-smoke.json`)

`shep harness eval run smoke` with the local Qwen3-8B: three small Node tasks, each in a throwaway
repository, once per mode.

| Score | Baseline | Query-aware |
| ----- | -------- | ----------- |
| Success | 67% | 67% |
| Input tokens (mean per task) | 10,999 | 14,279 (**+30%**) |
| Turns | 6.7 | 7.3 |
| Evidence recall | 83% | **100%** |

One case failed in each mode (`add-greet` on baseline, `fix-sum` on query-aware). On tasks this small
the query-aware system prompt costs more than the transcript it saves; see the paired evals for the
large-output case.

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
not model quality; the real-model run is above.

| Case | Success (B / QA) | Input tokens (B → QA) | Turns |
| ---- | ---------------- | --------------------- | ----- |
| smoke: 3 small Node tasks | 100% / 100% | 4,729 → 5,147 (**+9%**) | 4 / 4 |
| long-output: triage a 2,500-line build log | 100% / 100% | 54,825 → 13,416 (**−76%**) | 7 / 7 |

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
- `pnpm test:unit`: 1,165 files and 13,796 tests passed (2 skipped).
- `pnpm test:int`: 174 of 175 files and 1,922 tests passed.
  `tests/integration/security/dependency-path-traversal.test.ts` cannot load here: it requires the `electron` package, which this container cannot install (403 on download). CI installs it.
- `pnpm build`, `pnpm build:web` and `pnpm build:storybook` all succeed. `pnpm check:stories` passes.
