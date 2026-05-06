# Contributor-Onboarding Agent — Output Schema

The agent's structured output is defined by the TypeSpec model
**`ContributorOnboardingAgentOutput`** in
[`tsp/agents/contributor-onboarding-output.tsp`](../../tsp/agents/contributor-onboarding-output.tsp).
The generated TypeScript type lives in
`packages/core/src/domain/generated/output.ts` and is the single source of
truth for callers that parse the agent's response.

## Shape

| Field                | Type                       | Required | Notes                                                                |
| -------------------- | -------------------------- | -------- | -------------------------------------------------------------------- |
| `lane`               | `ContributorLane` enum     | Yes      | One of `docs`, `agents`, `ui`, `cli`, `infra`                        |
| `difficulty`         | `ContributionDifficulty`   | Yes      | One of `goodFirst`, `easy`, `medium`, `hard`                         |
| `acceptanceCriteria` | `string`                   | Yes      | Markdown checklist; lines start with `- [ ] `                        |
| `suggestedLabels`    | `string[]`                 | Yes      | At minimum `lane:<lane>` and `difficulty:<difficulty>`               |
| `welcomeComment`     | `string` (optional)        | No       | Include only when `difficulty === goodFirst`                         |

## Validation Rules

1. `lane` MUST match a value in the `ContributorLane` enum verbatim. No
   raw strings outside the enum (NFR-3 — TypeSpec-first).
2. `difficulty` MUST match a value in the `ContributionDifficulty` enum
   verbatim.
3. `acceptanceCriteria` MUST contain at least one `- [ ] ` line.
4. `suggestedLabels` MUST contain `lane:<lane>` and `difficulty:<difficulty>`
   exactly. Order is not significant.
5. `welcomeComment`, when present, MUST be a non-empty string.

## JSON Schema (for `outputSchema` option of `IAgentExecutor.execute`)

```json
{
  "type": "object",
  "additionalProperties": false,
  "properties": {
    "lane": { "type": "string", "enum": ["docs", "agents", "ui", "cli", "infra"] },
    "difficulty": { "type": "string", "enum": ["goodFirst", "easy", "medium", "hard"] },
    "acceptanceCriteria": { "type": "string", "minLength": 1 },
    "suggestedLabels": {
      "type": "array",
      "items": { "type": "string", "minLength": 1 }
    },
    "welcomeComment": { "type": "string", "minLength": 1 }
  },
  "required": ["lane", "difficulty", "acceptanceCriteria", "suggestedLabels"]
}
```

## Source of Truth

- TypeSpec definition: `tsp/agents/contributor-onboarding-output.tsp`
- Generated TS type: `packages/core/src/domain/generated/output.ts` →
  `ContributorOnboardingAgentOutput`
- System prompt referencing this schema: `prompts/contributor-onboarding/system.md`

Edit the TypeSpec file and run `pnpm tsp:compile` to update the generated
type. Do not hand-edit the generated file.
