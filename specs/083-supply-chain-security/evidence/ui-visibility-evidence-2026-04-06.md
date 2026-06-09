# Supply Chain Security — UI Visibility Evidence

**Date:** 2026-04-06
**Branch:** feat/supply-chain-security
**Validated against:** live `shep ui` on port 4055 (production bootstrap path via `pnpm dev:cli ui`)

## Summary

The supply chain security feature is now visible in the UI on all three designed surfaces:

1. **Settings page — Security section** (already wired)
2. **Control Center — feature cards** (gap found and fixed in this session)
3. **Repository drawer — SecurityPanel** (already wired, covered by Storybook evidence)

## Gap found and fixed

**File:** [src/presentation/web/app/(dashboard)/get-graph-data.ts:185-192](../../../src/presentation/web/app/(dashboard)/get-graph-data.ts#L185-L192)

The `buildGraphNodes()` helper accepted a `securityMode` option and `feature-node.tsx` rendered `<SecurityBadge>` whenever `data.securityMode` was set, but the canvas loader `get-graph-data.ts` never passed `securityMode` from settings into the builder. The wiring was stranded.

**Before fix:** 0 security badges rendered on the canvas (verified in browser via `document.querySelectorAll('[data-testid="security-badge"]').length === 0`).

**Fix:** Pull `security` out of `getSettings()` and forward `security?.mode` to `buildGraphNodes()`.

**After fix:** 13 security badges render on the canvas (one per feature card), matching the "Advisory" mode configured in settings.

## Regression tests added

[tests/unit/presentation/web/app/build-graph-nodes.test.ts](../../../tests/unit/presentation/web/app/build-graph-nodes.test.ts) — new `describe('securityMode propagation to feature nodes')` block with 4 tests covering Advisory, Enforce, Disabled, and omitted cases. All 22 tests in the file pass.

## Screenshots captured

| File | Surface | What it proves |
|------|---------|----------------|
| `live-settings-fullpage-2026-04-06.png` | Settings page | Full-page settings view with Security nav tab present |
| `live-settings-security-section-2026-04-06.png` | Settings > Security | Mode dropdown (Advisory), Policy Source (settings-default), Last Evaluation timestamp, Recent Findings list, Security spec doc link |
| `live-control-center-BEFORE-badge-fix-2026-04-06.png` | Canvas | Control center with feature cards but NO security badges (gap) |
| `live-control-center-AFTER-badge-fix-2026-04-06.png` | Canvas | Same view with yellow Advisory shield icons beside every feature title |

## Storybook evidence (from earlier phase, still valid)

| File | Component |
|------|-----------|
| `storybook-security-badge-disabled.png` | `SecurityBadge` mode=Disabled |
| `storybook-security-badge-advisory.png` | `SecurityBadge` mode=Advisory |
| `storybook-security-badge-enforce.png` | `SecurityBadge` mode=Enforce |
| `storybook-security-panel-no-findings.png` | `SecurityPanel` empty state |
| `storybook-security-panel-mixed-findings.png` | `SecurityPanel` with mixed-severity findings |
| `storybook-settings-disabled.png` | `SupplyChainSecuritySettingsSection` disabled |
| `storybook-settings-advisory-no-findings.png` | `SupplyChainSecuritySettingsSection` advisory / clean |
| `storybook-settings-advisory-findings.png` | `SupplyChainSecuritySettingsSection` advisory / findings |
| `storybook-settings-enforce-critical.png` | `SupplyChainSecuritySettingsSection` enforce / critical findings |

## Verification commands

```
pnpm typecheck           # clean
pnpm lint                # clean
pnpm vitest run tests/unit/presentation/web/app/build-graph-nodes.test.ts
# → 22 passed (4 new securityMode tests + 18 existing)
```

## Browser-side assertion

Executed in the live UI after the fix via Playwright MCP:

```
document.querySelectorAll('[data-testid="security-badge"]').length
// → 13
```
