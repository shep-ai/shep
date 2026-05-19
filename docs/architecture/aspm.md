# ASPM — Application Security Posture Management

Feature 098 adds Shep's ASPM module: a unified view of application risk
across code, dependencies, secrets, containers, cloud, APIs, identity,
runtime, compliance, and AI-generated changes. ASPM is anchored on the
existing `Application` entity and integrated through Shep's TypeSpec-first
Clean Architecture conventions — no presentation or application file
imports from `infrastructure/`.

This document is the module-level entry point. The TypeSpec source of
truth lives in `tsp/domain/entities/aspm/` and `tsp/domain/value-objects/aspm/`,
and the generated TypeScript types live in
`packages/core/src/domain/generated/output.ts`. Field listings for every
new entity are in [../api/domain-models.md](../api/domain-models.md).

## Goals

- Unify findings from SARIF and CycloneDX into a single
  `SecurityFinding` model with cross-scanner-comparable canonical
  severity AND preserved raw severity.
- Compute a transparent composite `RiskScore` (CVSS + EPSS + KEV +
  exposure + criticality + data classification) as a pure-domain
  function. Every score has a breakdown stored for audit.
- Resolve ownership deterministically from `.shep/ownership.yaml` + UI
  overrides.
- Track SLA windows in calendar days per canonical severity.
- Support self-declared `RiskException` with expiry and an immutable
  audit log.
- Run query-shaped `RemediationCampaign`s whose progress is computed at
  read time.
- Provide an executive dashboard (`/aspm`), findings list/detail
  (`/aspm/findings`), campaign board, owners view, compliance coverage,
  asset inventory, and an AI-change review queue.
- Convert any finding (or a campaign-shaped query) into Shep WorkItems.

## Layering

```
tsp/domain/entities/aspm/              ← TypeSpec source of truth
tsp/domain/value-objects/aspm/
        │
        ▼ pnpm tsp:compile
packages/core/src/domain/generated/output.ts   ← never hand-edited
        │
        ▼
packages/core/src/domain/aspm/         ← pure logic (scoring, SLA,
                                          ownership resolver, redactor,
                                          dedup key, errors)
        │
        ▼
packages/core/src/application/
  ├─ ports/output/repositories/        ← I<Entity>Repository ports
  ├─ ports/output/services/            ← IFindingIngestPort,
  │                                       ISbomPort, IExploitIntelPort,
  │                                       ISlaClockPort,
  │                                       IOwnershipYamlReader
  └─ use-cases/aspm/{findings,campaigns,exceptions,posture,
                     ai-review,compliance,ownership}/
        │
        ▼
packages/core/src/infrastructure/
  ├─ persistence/sqlite/migrations/    ← 101–114, idempotent
  ├─ repositories/aspm/                ← SQLite implementations
  ├─ services/aspm/                    ← SARIF, CycloneDX, KEV/EPSS,
  │                                       ownership-yaml, system clock
  └─ di/modules/register-aspm.ts       ← tsyringe wiring
        │
        ▼
src/presentation/
  ├─ web/app/aspm/*                    ← Next.js App Router pages
  ├─ web/app/api/aspm/*                ← SSE posture stream, etc.
  ├─ web/components/features/aspm/     ← components + colocated stories
  └─ cli/commands/aspm/                ← shep aspm subcommand tree
```

## Lifecycle of a finding

1. **Ingest.** A scanner emits a SARIF v2.1.0 document (or a CycloneDX
   SBOM). `shep aspm ingest --sarif file --application <slug>` (or the
   web upload, or an agent-triggered call) resolves
   `IngestFindingsUseCase` from the DI container. The use case
   delegates to `IFindingIngestPort` (SARIF) or `ISbomPort` (CycloneDX)
   — both validate with `ajv` against pinned schemas, enforce a 100MB
   max-size guard, and walk the validated tree into domain shape.
2. **Redact.** Scanner-supplied `description` and `scannerRaw` go
   through the pure-domain `Redactor` (AWS/GCP/Azure key prefixes,
   high-entropy strings, common token prefixes, PEM headers). Full raw
   is SHA-256 hashed; only the hash is stored.
3. **Dedup.** `findingDedupKey(applicationId, findingDomain, ruleId,
   locationPath, locationLine, cveId)` keys the partial unique index
   on `security_findings`. Re-ingestion of the same scanner run is a
   no-op (NFR-10).
4. **Enrich.** `IExploitIntelPort.isKev(cveId)` and
   `getEpssPercentile(cveId)` are looked up from the local-cached KEV
   and EPSS feeds. Missing data degrades gracefully (`null`/`false`).
5. **Score.** `computeRiskScore(inputs)` is a pure function producing
   `(total 0-100, breakdown)`. The result is appended to `risk_scores`;
   the finding's `currentRiskScoreId` points at the latest row.
6. **Own.** Ownership resolves deterministically: (1) UI override on
   Application/Service/ApiAsset, (2) `.shep/ownership.yaml` parsed via
   `IOwnershipYamlReader`, (3) Application's listed owner.
7. **Triage.** Findings surface in `/aspm/findings`, ranked by composite
   risk score descending, filterable via `FindingFilter`. Triagers can
   convert to a WorkItem, declare a `RiskException` with expiry, or let
   the campaign engine pick the finding up via its target query.

## SLA & exception state machine

SLA state is a pure function of `(discoveredAt, canonicalSeverity,
SecurityPolicy, ISlaClockPort.now())`:

- `Healthy` — elapsed < 50% of the policy window.
- `AtRisk` — elapsed in `[50%, 100%)`.
- `Breached` — elapsed ≥ 100%.

Findings with an Active `RiskException` are excluded from SLA breach
counts until the exception expires. Effective finding state at read
time factors in expired exceptions automatically (they transition the
finding back to its prior state on the next read).

## Risk score

`RiskScore.total` is `0-100`, computed deterministically from the
breakdown components:

- `cvssContribution` — base CVSS v3.1 severity normalized to 0-100.
- `epssContribution` — EPSS percentile scaled.
- `kevContribution` — flat boost when the CVE is on the KEV catalog.
- `exposureContribution` — derived from `Application.exposure`.
- `criticalityContribution` — derived from `Application.criticality`.
- `dataClassificationContribution` — derived from
  `Application.dataClassification`.

Weights live as documented constants in `domain/aspm/scoring/weights.ts`.
The fixture-driven golden-file test in
`tests/unit/domain/aspm/compute-risk-score.golden.test.ts` asserts
byte-stable output across representative inputs; any weight change must
update the fixture intentionally.

## AI-change risk review

`AiChangeRiskSignal` is a separate entity, not a tagged finding —
keeping SLA math and exception stats clean (research decision 6). Shep's
existing agent infrastructure resolves
`RecordAiChangeRiskSignalUseCase` from the DI container and records a
signal post-change. The `/aspm/ai-review` queue lists Open and
Acknowledged signals; reviewers can `Dismiss` (false-positive) or
`Graduate` (confirmed risk → new `SecurityFinding` with the signal's
evidence preserved). The use case is agent-agnostic — no Anthropic /
OpenAI SDK import outside infrastructure.

## Compliance

`ComplianceControl` carries `(frameworkId, controlId, title, description)`
for OWASP ASVS and CWE Top 25 in MVP. Findings link to zero-or-more
controls via SARIF taxa references during ingestion. Adding SOC2 / PCI
DSS / HIPAA is purely additive content — no schema change.

## CLI surface

`shep aspm` (parent) exposes:

- `ingest` — SARIF or SBOM ingestion with `--json` for machine-readable
  summaries.
- `findings list|show` — ranked findings + individual detail.
- `campaigns list|create|close|progress` — campaign lifecycle.
- `posture [--app <slug>]` — headline posture or per-application posture.
- `exceptions list-expiring` — exceptions about to expire.
- `ai-review list|dismiss|graduate` — AI-change queue triage.

Every leaf subcommand is thin — argument parsing + use-case call +
formatted output. All logic lives in the use cases.

## Web surface

Routes under `src/presentation/web/app/aspm/*`:

- `/aspm` — dashboard (posture cards, 30-day risk trend, live SSE).
- `/aspm/findings`, `/aspm/findings/[id]` — ranked list + detail panel.
- `/aspm/inventory` — React Flow asset-risk graph.
- `/aspm/owners` — owner map.
- `/aspm/compliance` — per-framework coverage view.
- `/aspm/ai-review` — AI-change review queue.

Every component under `components/features/aspm/` has a colocated
`*.stories.tsx` covering Default / Loading / Error plus the variants in
NFR-17 (Critical / High / KEV / Exception / AiGraduated).

Live posture updates stream over `/api/aspm/posture/stream` using the
existing SSE pattern; the dashboard's `PostureCardsLive` is the
subscriber.

## Determinism guarantees

- `computeRiskScore` is pure; identical inputs → identical score.
- `findingDedupKey` is pure; re-ingestion of an identical document
  inserts zero new rows.
- `computeSlaState`, `resolveOwnership`, and `effectiveFindingState` are
  pure functions over their inputs and `ISlaClockPort.now()`.
- Path inputs are normalized to POSIX before persistence and hashing
  (per `packages/CLAUDE.md`).

## Forward compatibility

ASPM tables ship with a nullable `workspace_id` column today. When the
workspace/permissions subsystem lands, this becomes a backfill — not a
structural rewrite (research decision 13).

## Related docs

- [../api/domain-models.md](../api/domain-models.md) — entity field
  listings.
- [clean-architecture.md](./clean-architecture.md) — layer rules.
- [repository-pattern.md](./repository-pattern.md) — repository + DI
  conventions.
- [../development/typespec-guide.md](../development/typespec-guide.md) —
  authoring `tsp/`.
- [../development/tdd-guide.md](../development/tdd-guide.md) — RED-first
  test discipline.
