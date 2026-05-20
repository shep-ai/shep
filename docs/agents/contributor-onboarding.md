# Contributor-Onboarding Agent

## Purpose

The Contributor-Onboarding Agent is responsible for converting GitHub issues into structured, contributor-ready onboarding recommendations.

It takes raw issue data and produces a consistent grooming artifact used by downstream automation to:

- classify the issue into a lane
- estimate difficulty
- generate acceptance criteria
- suggest labels
- optionally provide a welcome comment for good-first issues

The agent is **read-only and recommendation-only**. It does not mutate GitHub state directly.

All side effects are handled externally via supervisor-gated workflows.

---

## Agent Identity

| Property | Value |
|-----------|--------|
| Agent | `contributor-onboarding` |
| Lane | `agents` |
| Registration | Custom-agent rail |
| Integration Point | `packages/core/src/application/use-cases/contributors/groom-issue.use-case.ts` |
| Spec | `specs/097-ai-native-contributor-onboarding/spec.yaml` |

The core orchestration is implemented in `GroomIssueUseCase`, which composes lane classification, acceptance criteria generation, and difficulty inference.

---

## System Prompt

The agent behavior is defined in the prompt layer and should be treated as the source of truth.

Prompt files:

- `prompts/contributor-onboarding/system.md`
- `prompts/contributor-onboarding/output-schema.md`

These files define:

- lane classification rules
- difficulty heuristics
- acceptance criteria constraints
- label generation rules
- welcome comment behavior

This documentation intentionally does **not duplicate prompt logic**. Any behavioral changes must be made in the prompt files.

---

## Output Schema

The agent outputs a structured object defined by TypeSpec:

- `tsp/agents/contributor-onboarding-output.tsp`
- `ContributorOnboardingAgentOutput` (generated in `packages/core/src/domain/generated/output.ts`)

### Shape

```ts
{
  lane: ContributorLane;
  difficulty: ContributionDifficulty;
  acceptanceCriteria: string;
  suggestedLabels: string[];
  welcomeComment?: string;
}
```

### Field Rules

| Field | Description |
|------|-------------|
| `lane` | One of: `docs`, `agents`, `ui`, `cli`, `infra` |
| `difficulty` | One of: `goodFirst`, `easy`, `medium`, `hard` |
| `acceptanceCriteria` | Markdown checklist (`- [ ]` required format) |
| `suggestedLabels` | Must include `lane:<lane>` and `difficulty:<difficulty>` |
| `welcomeComment` | Only present for `goodFirst` issues |

### Required Validation Rules

- `lane` must match `ContributorLane` exactly
- `difficulty` must match `ContributionDifficulty` exactly
- `acceptanceCriteria` must include at least one checklist item
- `suggestedLabels` must include:
  - `lane:<lane>`
  - `difficulty:<difficulty>`
- `welcomeComment`, when present, must be non-empty

---

## Grooming Flow

The agent is executed via `GroomIssueUseCase`:

1. Fetch GitHub issue via `IExternalIssueFetcher`
2. Classify issue into a lane
3. Infer difficulty using labels + heuristics
4. Generate acceptance criteria via LLM/prompt layer
5. Merge and generate suggested labels
6. Optionally generate welcome comment

### Difficulty Heuristics

- `goodFirst` → explicitly labeled or very small scoped issue
- `easy` → simple, single-file or low complexity changes
- `medium` → multi-file or moderate domain knowledge required
- `hard` → large scope, cross-cutting, or complex system changes

---

## Suggested Labels

The agent preserves existing labels and adds:

- `lane:<lane>`
- `difficulty:<difficulty>`

Example:

```
lane:agents
difficulty:easy
```

---

## Supervisor Gate (NFR-5)

The contributor onboarding agent is **pure and side-effect free**.

It does NOT:

- modify GitHub issues
- post comments
- assign users
- apply labels directly

Instead, it returns a structured recommendation that is validated by a supervisor layer.

External writes are handled via:

- `IGitHubIssueWriter`
- `IContributorActionGate`

### Flow

1. Issue is fetched
2. Agent generates structured output
3. Supervisor validates output (NFR-5 gate)
4. Policy checks determine allowed actions
5. Only approved actions mutate external state

This ensures deterministic, auditable behavior.

---

## Tool Surface

The agent operates with a **read-only toolset**:

Allowed tools:

- `Read`
- `Grep`
- `Glob`
- `WebFetch`
- `WebSearch`

Explicitly disallowed:

- `Bash`
- `Write`
- `Edit`
- `NotebookEdit`
- `TodoWrite`

This restriction is enforced in the executor layer and validated by tests.

---

## Local Testing

The contributor onboarding agent includes a **golden-path integration test**.

Run it locally:

```bash
pnpm test tests/integration/application/use-cases/contributors/contributor-onboarding-agent.integration.test.ts
```

### What the test validates

1. Agent registration via custom-agent rail
2. Prompt loading from:
   - `prompts/contributor-onboarding/system.md`
   - `prompts/contributor-onboarding/output-schema.md`
3. Execution via mocked deterministic executor
4. Schema validation against `ContributorOnboardingAgentOutput`
5. Enum correctness for:
   - `lane`
   - `difficulty`
6. Label correctness (`lane:*`, `difficulty:*`)
7. Supervisor enforcement of read-only tool constraints

---

## Related Documentation

- `docs/architecture/agent-system.md`
- `docs/development/adding-agents.md`
- `specs/097-ai-native-contributor-onboarding/spec.yaml`

---

## Navigation Links

### CONTRIBUTING.md

```md
## Contributor Onboarding Agent

See `docs/agents/contributor-onboarding.md` for details on how issue grooming works, expected output format, and how to run the integration test locally.
```

### docs/architecture/agent-system.md

```md
Related Agents:

- Contributor Onboarding Agent → ../agents/contributor-onboarding.md
```