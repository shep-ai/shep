## Technology Decisions

### Flag default and storage
`sdlcBoard` defaults to `false` and is stored in `feature_flag_sdlc_board INTEGER NOT NULL
DEFAULT 0` (migration 171). Existing installs read 0, so the board is off after upgrade.

### Catalog group
Platform — the board is a product view across features, like Projects.

### Shared 404 for gated API routes
`intakeDisabled()` moves to `lib/feature-gate.ts` as `featureNotFound()`, next to
`isFeatureOn()`, which `requireFeaturePage()` now uses too.

### Server actions
The four board actions return `{ error: FEATURE_OFF_ERROR }` while the flag is off.

### Board tracker
Unchanged; the agent keeps writing `sdlc_tasks` rows.

## Library Analysis

No new libraries.

## Security Considerations

Gating the API route and server actions keeps the board's data and mutations unreachable while
the view is off, not just unlinked.

## Performance Implications

While the flag is off no client opens the 2-second polling SSE stream. No other effect.
