# Contributing to Shep with Shep

This is the dogfooding loop. The contributor-onboarding pipeline (spec [097](../../specs/097-ai-native-contributor-onboarding/)) lets you use Shep's own agents to land a PR against Shep itself. The same loop works for any OSS project that adopts Shep — nothing here is hardcoded to this repo.

If you've never contributed before, start with [CONTRIBUTING.md](../../CONTRIBUTING.md). Come back here once you have a green `shep doctor` and want to actually ship something.

---

## The Loop

```
 You pick or       Shep grooms       Shep opens         You merge          Shep welcomes
 file an issue  →  it via agent  →   the PR        →    the PR         →   + adds you to
                                                                            recognition
```

Five steps, each backed by a use case in `application/use-cases/contributors/`.

---

## Step 1 — Pick or file an issue

```bash
# Browse curated issues
open ./GOOD_FIRST_ISSUES.md

# Or file one yourself using the structured form
# .github/ISSUE_TEMPLATE/feature-request.yml — includes lane / difficulty / acceptance criteria
```

Issue templates require a **lane** (`docs | agents | ui | cli | infra`) and accept a **difficulty** (`goodFirst | easy | medium | hard`) plus **acceptance criteria** as a markdown checklist. The grooming agent reads these directly — fill them in honestly so reviewers don't have to guess.

---

## Step 2 — Have Shep groom the issue

```bash
pnpm dev:cli contributors groom-issue --number <issue>
```

What this runs:

1. `IExternalIssueFetcher` pulls the issue body via the existing GitHub integration.
2. `classify-into-lane.use-case.ts` runs deterministic rules (title prefixes, label hints, keyword heuristics) — sub-100 ms when conclusive.
3. If the rules return ambiguous, the contributor-onboarding agent (registered through `CreateCustomAgentUseCase`) runs via `IAgentExecutorProvider` and returns a single `ContributorLane` enum value.
4. `propose-acceptance-criteria.use-case.ts` returns a markdown checklist seeded from your issue body.
5. The aggregate result (`{ lane, difficulty, acceptanceCriteria, suggestedLabels[], welcomeComment? }`) is returned to you. Nothing is applied to the issue yet.

If you want Shep to actually apply the labels and post a comment, run with `--apply` and the supervisor approval gate will surface the proposed mutation for human approval (per spec 093). The default is read-only.

---

## Step 3 — Spin up a worktree and let your agent code

```bash
shep feat new "fix: <description from the groomed issue>" --push --pr
```

Shep:

- creates an isolated git worktree under `.worktrees/`
- branches from `main`
- hands the prompt to your configured agent (Claude / Cursor / Gemini, agent-agnostic via `IAgentExecutorProvider`)
- commits incrementally in conventional-commit format
- pushes the branch and opens a draft PR
- watches CI; if it fails, retries up to three times before pausing

You stay in your editor. Open the worktree directly to take over manually if you ever want to.

---

## Step 4 — Merge the PR

Reviewer approves; you squash-merge. semantic-release publishes on `feat`/`fix` types.

---

## Step 5 — Automatic recognition

On `pull_request.closed` (merged), `.github/workflows/welcome-first-time-contributor.yml` invokes a Shep CLI subcommand which calls:

- `welcome-first-time-contributor.use-case.ts` — detects whether you're a first-time contributor (zero prior merged PRs); if yes, drafts a welcome comment and emits a `RecognitionEvent`. Posting the comment is supervisor-gated (NFR-5).
- `award-recognition.use-case.ts` — idempotently inserts a `RecognitionEvent` (UNIQUE on `contributor_id, kind, pr_number` per NFR-11), upserts your `Contributor` record, calls `IAllContributorsWriter.appendContributor(...)` which mutates `.all-contributorsrc` and the README contributors block.

You graduated from User to Contributor. No `@all-contributors` bot install needed — Shep wrote the file itself.

The next monthly recap (`generate-monthly-recap` → `publish-monthly-recap`, multi-channel via `IRecapPublisher` adapters: file, Discord, GitHub Discussion) will mention you again.

---

## Why this exists

Spec 097's premise: Shep is an AI-native SDLC platform; one of its native abilities should be helping itself grow. Outsourcing recognition to a third-party GitHub App, or leaving issue grooming to maintainers' free time, contradicts that. The whole pipeline is built on existing Shep primitives — the custom-agent rail, the supervisor approval gate, `IAgentExecutorProvider`, the in-process scheduler — and nothing in it is Shep-repo-specific. Adopting projects get the same loop for free.

---

## Going Deeper

- Spec: [`specs/097-ai-native-contributor-onboarding/`](../../specs/097-ai-native-contributor-onboarding/)
- Use cases: `packages/core/src/application/use-cases/contributors/`
- Agent prompt: [`prompts/contributor-onboarding/system.md`](../../prompts/contributor-onboarding/system.md)
- Output schema: [`prompts/contributor-onboarding/output-schema.md`](../../prompts/contributor-onboarding/output-schema.md)
- Workflows: `.github/workflows/welcome-first-time-contributor.yml`, `.github/workflows/label-by-lane.yml`
- Supervisor gate (dependency): [docs/architecture/supervision.md](../architecture/supervision.md)
- Recap pattern (reused from): [spec 096](../../specs/096-ai-release-notes/)
