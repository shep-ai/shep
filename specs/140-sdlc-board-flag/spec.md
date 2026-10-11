## Problem Statement

The owner decided the SDLC board (/sdlc) should not be part of the default product surface.
Spec 135 introduced a feature-flag catalog and a dedicated flags view, so the board should be
one more catalog flag — off by default, togglable from /settings/feature-flags and
`shep settings flags` — rather than deleted.

## Success Criteria

- [ ] `featureFlags.sdlcBoard` exists in TypeSpec, defaults to `false`, persists through
      migration 171 (`feature_flag_sdlc_board INTEGER NOT NULL DEFAULT 0`), the mapper and the
      repository SQL, and round-trips through the settings repository.
- [ ] The flag is in `FEATURE_FLAG_CATALOG` (Platform group) with a description, so it shows on
      /settings/feature-flags and in `shep settings flags`, with labels in all 9 locales.
- [ ] With the flag off: no SDLC Board sidebar link, /sdlc returns 404, GET /api/sdlc-events
      returns 404, and `listSdlcBoard`, `updateSdlcTaskStatus`, `updateSdlcSubtaskStatus` and
      `reorderSdlcTask` return an error without calling their use cases.
- [ ] With the flag on, every surface behaves exactly as before.
- [ ] The canvas, the /features table and the agent-side board tracker are unchanged.

## Affected Areas

| Area | Impact | Reasoning |
| ---- | ------ | --------- |
| `tsp/domain/entities/settings.tsp` + generated output | Low | One new boolean flag |
| SQLite migration 171, settings mapper, settings repository | Low | Persist the flag |
| Domain defaults + feature-flag catalog | Low | Default off, listed in the flags view |
| Web: sidebar links, /sdlc page, /api/sdlc-events, 4 server actions | Medium | The gated surfaces |
| Web: shared feature-gate helper, intake routes | Low | One 404 helper shared by gated API routes |
| Translations (9 locales) | Low | Flag label and description |
| E2E accessibility spec | Low | /sdlc now needs the flag turned on |

## Dependencies

Builds on spec 135 (feature-flag catalog, `requireFeaturePage`, `/settings/feature-flags`,
`shep settings flags`). The SDLC board has no CLI group, so there is no CLI command to gate;
`shep settings flags enable sdlcBoard` turns it on from the CLI.

## Size Estimate

**S** - One flag through the standard flag checklist plus five web gates; no new behaviour.
