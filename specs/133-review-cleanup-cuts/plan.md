## Architecture Overview

```
domain/shared/feature-flag-catalog.ts  (Record<keyof FeatureFlags, {group, description}>)
        │
ListFeatureFlagsUseCase / SetFeatureFlagUseCase  (ISettingsRepository)
        │                         │
shep settings flags        /settings/feature-flags page ─ FeatureFlagsList ─ settings page section
```

Gating reads `featureFlags.<area>`: sidebar links carry `flag`, pages call `notFound()`,
API routes call `requireFeatureFlag`, CLI groups go through `gateByFeatureFlag`, and the
daemon's background-sync loops skip disabled areas.

## Implementation Strategy

Items are independent, so each lands as one commit in the order C1, C3, C4, C5, C7, C2. C3
precedes C4 because the fold makes supply chain follow the ASPM default. C2 goes last since
it touches every settings fixture that C3/C4/C7 also touch.

Clean Architecture holds throughout: the catalog lives in `domain/`, the list/set logic in
`application/` use cases, and CLI and web stay thin presentation over them.

## Testing Strategy (TDD: Tests FIRST)

Every task runs RED-GREEN-REFACTOR: the failing test lands first, then the minimal change,
then cleanup.


- Unit: defaults factory (aspm false, new flags true, no autoUpdate/supplyChainSecurity),
  catalog completeness, list/set use cases, supply-chain helper, flag gate helper, sidebar
  link visibility, CLI commands (contributors stale-issues/recap, settings flags, gated group).
- Integration: settings repository round-trip with non-default values for every new column;
  migration 166 is idempotent and defaults to 1; legacy `aider` agent type reads back as the
  default; DI bootstrap resolves the new use cases.
- Storybook: FeatureFlagsList stories; existing stories updated for removed props.

## Risk Mitigation

| Risk | Mitigation |
| ---- | ---------- |
| Shep's own CI security gate goes inert when ASPM defaults off | CI enables the aspm flag via `shep settings flags enable aspm` before enforcing |
| Users with persisted removed enum values crash on read | Mapper falls back to the default agent type |
| Migration collisions with parallel workstreams | Merge main and renumber before merge |
| Missing a settings column in repository SQL | Round-trip test with non-default values for every new flag |
