# Hardening, Stability & Refactoring Notes — Feature 089

Post-implementation action items from a read-only review of the one-click cloud deploy flow on `feat/089-one-click-cloud-deploy`. Each item is scoped to be actionable in isolation.

## Stability

- [ ] **Stuck `Uploading` status after crash** — `InitiateCloudDeploymentUseCase` is fire-and-forget; a server crash mid-deploy leaves `Application.cloudDeploymentStatus = Uploading` with no reconciliation. Add a startup sweep that marks orphaned in-flight deploys as `Failed` with a "server restarted" reason, or persist a heartbeat and expire stale ones.
- [ ] **No rollback on partial success** — if `wrangler` succeeds but the subsequent `Application` row update fails, the deployment is live but `liveUrl` is never persisted. Wrap the post-deploy persistence in a retry loop and, on exhaustion, log a `CloudDeploy` error entry with the live URL so the user can recover manually.
- [ ] **No pre-flight token health check** — expired Cloudflare tokens surface as cryptic mid-deploy API errors. Add a lightweight `provider.verifyToken()` call at the start of `InitiateCloudDeploymentUseCase`, before transitioning status to `Uploading`.
- [ ] **`BuildOutputNotFoundError` surfaces late** — the `setupComplete` gate was removed, so users only discover a missing build dir after clicking Deploy. Add an upfront check in `ListCloudProvidersUseCase` (or a new `GetDeployReadinessUseCase`) that the UI can use to disable the Deploy button with a clear reason.

## Hardening

- [ ] **Fragile wrangler stdout parsing** — `CloudflarePagesProvider.parseWranglerOutput` at [cloudflare-pages.provider.ts:355-403](packages/core/src/infrastructure/services/cloud-deploy/cloudflare-pages.provider.ts#L355-L403) uses string matching across two wrangler output formats. Switch to `wrangler pages deploy --json` if available, or capture the full stdout/stderr into the operation log on parse failure so debugging doesn't require reproducing the deploy.
- [ ] **Unimplemented provider stubs are dead-but-wired** — Vercel, Netlify, AWS, GCP adapters throw `ProviderNotImplementedError` on every method. They're registered in DI and gated only by an `enabled` flag. Either delete them until they're actually implemented, or wrap them in a single `NotImplementedProvider` class to avoid four parallel stub files drifting.
- [ ] **Windows `gh` arg quoting is inconsistent** — `git-remote.service.ts` has a quoting helper applied to `gh repo create` but not to other `gh` subcommands. Extract a single `runGh(args: string[])` wrapper that applies the quoting helper uniformly and route every `gh` invocation through it.
- [ ] **Operation log drawer polls at 1.5s** — fine for short ops, perceptibly laggy for long deploys. Subscribe the drawer to the existing SSE event bus (`ICloudDeploymentEventBus` / agent-events) instead of polling, reusing the same stream already driving the deploy button.
- [ ] **Token storage has no rotation / revocation path** — once stored, tokens live until manually wiped. Add a "disconnect provider" action that deletes the row from `ICloudProviderTokensRepository` and clears the UI connected flag.

## Refactoring

- [ ] **`InitiateCloudDeploymentUseCase` is doing too much** — it validates the app, resolves the build dir, manages status lifecycle, invokes the provider, and handles errors. Extract a `CloudDeployLifecycle` helper that owns the status transitions so the use case reads as a linear orchestration.
- [ ] **Persisted-URL-wins logic in `GetGitStatusUseCase`** is correct but undocumented. Add a one-line comment at [get-git-status.use-case.ts:50-69](packages/core/src/application/use-cases/cloud-deploy/get-git-status.use-case.ts#L50-L69) explaining *why* the persisted URL takes precedence (defends against transient `git` subprocess failures) so a future refactor doesn't flip it.
- [ ] **`SmartDeployCluster` fans out to three hooks** (`useGitStatus`, `useCloudDeployStatus`, `useOperationLogs`) with overlapping polling cadences. Consolidate into a single `useApplicationDeployState` hook that owns all poll intervals and exposes a unified state shape, reducing re-renders and race conditions between the three data sources.
- [ ] **`OperationLogKind` enum is growing informally** — currently `CloudDeploy`, `GitRemoteCreate`, `RepoSync`. Document the kind/id contract (what ID space each kind uses) in a comment in `apis/json-schema/OperationLogKind.yaml` before a fourth kind is added.
- [ ] **Provider adapters duplicate error-mapping boilerplate** — each catches raw HTTP errors and rethrows as domain errors. Extract a shared `mapProviderHttpError(err, provider)` helper in `infrastructure/services/cloud-deploy/shared/` so new providers don't reinvent the mapping.
- [ ] **Fire-and-forget route pattern is repeated** — `initiate/route.ts` and `create-remote/route.ts` both kick off a use case and return 202. Extract a small `fireAndForget(useCase, input)` wrapper that standardizes the error-to-operation-log path, so future async endpoints don't each implement it from scratch.

## Enhancements

- [ ] **Live deployment status on the `/applications` grid** — the per-app top bar already streams state via SSE, but the Apps list page is static. Surface `Application.cloudDeploymentStatus` + `cloudDeploymentUrl` on each card with a live indicator: pulsing dot for `Uploading`, green "Live" pill with clickable URL for `Deployed`, red retry chip for `Failed`. Feed off the same `ICloudDeploymentEventBus` SSE stream — no new polling. Turns the grid into a cross-app mini dashboard and makes "what's live right now?" answerable at a glance.

## Test gaps to fill alongside the above

- [ ] Integration test: server restart mid-deploy leaves no stuck `Uploading` row.
- [ ] Integration test: wrangler output parse failure writes full stdout to operation log.
- [ ] Integration test: expired Cloudflare token fails fast at `verifyToken()` before status transitions.
- [ ] Unit test: `GetGitStatusUseCase` returns persisted URL when `git remote -v` subprocess fails.
- [ ] E2E test: disconnect-provider action clears the connected flag and forces the connect modal on next deploy click.
