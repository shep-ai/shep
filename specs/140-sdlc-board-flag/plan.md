## Architecture Overview

```
tsp FeatureFlags.sdlcBoard (= false)
   └─ generated output.ts ─┬─ settings-defaults.factory (false)
                           ├─ settings.mapper ⇄ feature_flag_sdlc_board (migration 170, DEFAULT 0)
                           ├─ sqlite-settings.repository (INSERT/UPDATE)
                           └─ FEATURE_FLAG_CATALOG (Platform) → /settings/feature-flags, `shep settings flags`

web getFeatureFlags().sdlcBoard
   ├─ sidebar-links.ts       flag: 'sdlcBoard'          → link hidden
   ├─ app/sdlc/page.tsx      requireFeaturePage()       → 404
   ├─ api/sdlc-events        featureNotFound()          → 404
   └─ 4 board actions        { error: FEATURE_OFF_ERROR } before resolving the use case
```

## Implementation Strategy

Phase 1 threads the flag through the LESSONS "Adding a Web Feature Flag" checklist so it
persists and shows on the flags view. Phase 2 extracts the shared feature gate (`isFeatureOn`,
`featureNotFound`, `FEATURE_OFF_ERROR`) from spec 135's helpers, then gates the page, the
sidebar link, the SSE route and the actions, and finally updates the e2e accessibility spec and
docs.

## Files to Create/Modify

| File | Change |
| ---- | ------ |
| migration `170-add-sdlc-board-feature-flag.ts` | New guarded column, DEFAULT 0 |
| `lib/feature-gate.ts` | `isFeatureOn`, `featureNotFound`, `FEATURE_OFF_ERROR` |
| `lib/require-feature-page.ts`, `lib/intake-route.ts`, feedback/alerts routes | Use the shared gate |
| `app/sdlc/page.tsx`, `api/sdlc-events/route.ts`, 4 actions, `sidebar-links.ts` | Gate on `sdlcBoard` |
| TypeSpec, defaults, catalog, mapper, repository, web flags, translations | The flag itself |

Clean Architecture layering is unchanged: the flag lives in the domain (TypeSpec, defaults,
catalog), persistence stays in infrastructure (migration, mapper, repository), and the gates are
presentation-only checks in front of the existing sdlc-board use cases.

## Testing Strategy (TDD: Tests FIRST)

Every task with code runs RED-GREEN-REFACTOR: write the failing test, make it pass with the
smallest change, then tidy.

- **Unit (RED first):** defaults factory has `sdlcBoard: false`; mapper round-trips
  `feature_flag_sdlc_board`; catalog lists `sdlcBoard`; `isFeatureOn`/`featureNotFound`;
  sidebar hides the link while off; the SSE route returns 404 while off; each action returns
  the error and does not resolve its use case while off, and delegates while on; /sdlc page
  calls `notFound()` while off.
- **Integration:** migration 170 adds the column with DEFAULT 0 and is idempotent; the
  settings repository round-trips the flag.
- **E2E:** the /sdlc accessibility case turns `sdlcBoard` on for its run via
  `enableFeatureFlag`.

## Risk Mitigation

| Risk | Mitigation |
| ---- | ---------- |
| Mapper and repository SQL drift, silently dropping the flag | Repository round-trip test |
| A fixture missing the new flag | `pnpm typecheck` plus the defaults `toEqual` test |
| Migration number collides with another workstream | Merge `main` before merging and renumber |
| E2E /sdlc case 404s now that the flag is off | Turn the flag on in that case |
