# ASPM Native Scanning

Phase 11 of the ASPM module (feature 098) replaces the upload-driven ingest
UX with native scan/rescan that runs entirely inside Shep. This document
covers the end-to-end pipeline, the in-house vs agent-driven split, the
local-branch-only scope contract, and the offline-degradation behavior.

## Goals

- **Scan, don't ingest.** The user picks an application, clicks **Scan now**,
  and Shep walks the local working tree. No CI pipeline is required.
- **Minimize third-party deps.** SBOM, secrets, and ownership are all
  in-house. SAST, container hardening, and IaC misconfiguration are
  agent-driven via `IAgentExecutorProvider` — no hardcoded provider.
- **Local working tree only.** Cross-repo / remote-branch scanning is
  explicitly out of scope.
- **Idempotent rescans.** Re-running on an unchanged tree adds zero new
  findings (FR-8 / NFR-10).

## Pipeline

```
Scan / Rescan
   │
   ▼
ScanApplicationUseCase
   │ ── walk repo via IFileTreeReaderPort (excludes from ScannerProfile)
   │ ── per-enabled stage, isolated try/catch (NFR-25):
   │    sbom      → buildSbom(files)                   → SbomComponentDraft[]
   │    sca       → OsvVulnerabilityAdapter(components) → SbomVulnerabilityDraft[] → FindingDraft[]
   │    secrets   → scanForSecrets(files)              → FindingDraft[]
   │    sast      → ISastAnalyzer.run(files)           → FindingDraft[]   (agent)
   │    container → IContainerHardeningAnalyzer.run    → FindingDraft[]   (agent)
   │    iac       → IIacSecurityAnalyzer.run           → FindingDraft[]   (agent)
   │ ── map FindingDraft → SecurityFinding:
   │      redact secrets, compute dedup key, resolve ownership
   │      (.shep/ownership.yaml > IGitOwnershipPort)
   │ ── findingRepo.bulkInsertOrIgnore (idempotent)
   │ ── scanRunRepo.save(ScanRun)  ── status: Succeeded / Partial / Failed
   │ ── applications.lastScannedAt = now (unless Failed)
   ▼
ScanRun
```

## In-house vs agent-driven

| Stage     | Implementation                                            | Why                                                                        |
| --------- | --------------------------------------------------------- | -------------------------------------------------------------------------- |
| sbom      | Pure-domain SbomBuilder + 10 manifest parsers             | Deterministic, no third-party deps, fast                                   |
| sca       | OSV.dev adapter (with disk cache + offline fallback)      | Single canonical source for OSS vuln intel                                 |
| secrets   | Pure-domain regex + Shannon-entropy rules                 | Low false-positive rate, deterministic                                     |
| sast      | Agent via `IAgentExecutorProvider`                        | Static analysis benefits from LLM context awareness                        |
| container | Agent via `IAgentExecutorProvider`                        | Container hardening rules are well-described in natural language           |
| iac       | Agent via `IAgentExecutorProvider`                        | IaC misconfigs span many providers/formats — agents generalize cheaply     |

Every agent-driven analyzer implements the same `IAgentSecurityAnalyzer`
port. The orchestrator depends only on the port — provider SDKs never leak
into the application layer (per [AGENTS.md](../../AGENTS.md)).

## ScannerProfile

Per-application config lives on `Application.scannerProfile` (JSON-encoded):

| Field          | Default                 | Purpose                                              |
| -------------- | ----------------------- | ---------------------------------------------------- |
| enabledStages  | every stage             | Stages the orchestrator will run                     |
| pathExcludes   | `[]` (plus built-ins)   | Glob list passed to IFileTreeReaderPort              |
| autoRescan     | `true`                  | Whether the nightly scheduler picks this app up      |

When `Application.scannerProfile` is absent, the defaults apply. The
settings panel UI (`ScannerProfileSection`) round-trips these fields to a
server action.

## Nightly auto-rescan

`ScanSchedulerService` is a daemon-side loop:

1. Every 15 minutes, list every Application.
2. Skip apps where `scannerProfile.autoRescan === false`.
3. Skip apps whose `lastScannedAt` is within the last 24h.
4. Enqueue `RescanApplicationUseCase` with `triggeredBy: ScanTrigger.Schedule`.

The scheduler is fake-clock testable. A global toggle (`autoRescanEnabled`
in settings) disables it entirely.

## Offline degradation

| Component                | Offline behavior                                                                |
| ------------------------ | ------------------------------------------------------------------------------- |
| OsvVulnerabilityAdapter  | Returns cached results under `~/.shep/cache/osv/` with `cacheOnly: true`        |
| Exploit-intel feeds      | Cache-served via the existing 24h KEV/EPSS loaders                              |
| Agent analyzers          | Mark stage `Failed`, run is `Partial` — other stages still complete             |
| GitOwnershipAdapter      | Falls back to CODEOWNERS if `git log` returns nothing                           |

## Upload escape-hatch

The previous upload UX (`AspmIngestDialog`) is preserved as a secondary
tab inside the new `AspmScanDialog` ("Upload existing report"). CI
pipelines that already produce SARIF/CycloneDX still flow through
`ingestAspmDocument` → `IngestFindingsUseCase` / `IngestSbomUseCase`
without changes.

## CLI

```
shep aspm scan   --app <slug> [--stages sbom,secrets] [--json]
shep aspm rescan --app <slug> [--stages secrets]      [--json]
shep aspm ingest --sarif <file> --application <slug>          # still supported
```

## Tested invariants

| FR/NFR  | Where verified                                                                  |
| ------- | ------------------------------------------------------------------------------- |
| FR-8    | scan-application.test.ts: "emits zero findings on a second run …"               |
| NFR-10  | Same (dedup unique index)                                                       |
| NFR-22  | secret-scanner.test.ts: 12 seeded secrets / zero false negatives                |
| NFR-24  | secret-scanner.test.ts: determinism — identical drafts across two runs          |
| NFR-25  | scan-application.test.ts: "marks the run Partial when at least one stage fails" |

## Out of scope (deferred)

- SSE scan-progress stream at `/api/aspm/scan/stream` (task-76)
- Playwright e2e happy path (task-83)

Both can land in a follow-up — the orchestration use case already returns
the full `ScanApplicationResult` synchronously, so the dialog's "scan
finished" callback is sufficient for the v1 UX.
