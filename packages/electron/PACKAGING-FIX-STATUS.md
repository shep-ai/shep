# Electron Packaging Fix — History & Status

**Status:** DONE — validated by user on 2026-04-23. AppImage launches end-to-end on Linux, `GET /applications` returns HTTP 200 with real HTML, GUI window visible and functional. This file can be archived once the fix merges.

**Validation criteria (DoD):**
> The packaged `Shep Apps-0.0.0-linux-x86_64.AppImage` starts end-to-end on a clean Linux machine: splash → main window → Applications list renders → no console errors in the main process log → USER has acked it is working.

Until the user acks, this file is the source of truth for what has been tried, what worked, what didn't, and what to try next.

---

## Problem Statement

The existing `release/Shep-*.AppImage` (full shell) and the new `release-apps-only/Shep Apps-*.AppImage` (apps-only variant added in this branch) both crash at launch with:

```
Error: Cannot find module '@anthropic-ai/claude-agent-sdk'
Require stack:
- resources/app.asar/dist/main.cjs
- resources/app.asar/dist/entry.cjs
```

…and, after that is fixed, with:

```
Error: Failed to load external module next/dist/compiled/next-server/app-route-turbo.runtime.prod.js
Require stack:
- resources/web/.next/server/chunks/[root-of-the-server]__*._.js
- resources/web/.next/server/chunks/[turbopack]_runtime.js
- resources/app.asar/node_modules/next/dist/server/…/instrumentation-globals.external.js
- resources/app.asar/node_modules/next/dist/server/next-server.js
- resources/app.asar/node_modules/next/dist/server/next.js
- resources/app.asar/dist/main.cjs
```

Both errors are fundamentally the same class of problem: pnpm + Turbopack + electron-builder asar packaging produces a packaged tree where **runtime `require()` calls can't resolve the modules they need**.

---

## Root Causes Identified

### 1. pnpm workspace layout is invisible to electron-builder

pnpm's default isolated layout stores transitive deps as symlinks under `.pnpm/...`. electron-builder's node-module collector logs `no node modules found in collection, trying next search directory` on that tree and falls back to the monorepo root — then packages only the DIRECT deps declared in `packages/electron/package.json`, silently dropping every transitive (e.g. `@ai-sdk/gateway`, a dep of `ai`).

### 2. Transitive deps of `@shepai/core` are not declared on `@shepai/electron`

`scripts/build.mjs` externalizes every dep from (a) root `package.json`, (b) `packages/electron/package.json`, and (c) `packages/core/package.json`. At runtime the bundled `main.cjs` does `require('@anthropic-ai/claude-agent-sdk')`, but that package is declared only on the root — electron-builder doesn't know to include it.

### 3. Web UI chunks reference Turbopack-internal files across the asar boundary

The Next.js production build (`pnpm build:release`) outputs Turbopack-compiled chunks under `web/.next/server/chunks/` that contain literal `require('next/dist/compiled/next-server/app-*-turbo.runtime.prod.js')` calls. When packaged:

- `resources/web/` lives OUTSIDE `app.asar` (via electron-builder `extraResources`).
- `resources/app.asar/node_modules/next/dist/compiled/...` lives INSIDE the asar.
- Node's resolver walks up from the caller's `__dirname` (inside `web/`) and never reaches the asar's node_modules.

Turbopack uses its own `externalRequire` function which, for bare specifiers, still ultimately uses Node's `require()` — so setting `NODE_PATH` from the Electron main SHOULD help, but it didn't (see Attempt 9 below).

---

## Attempts Timeline

Each attempt records: what was tried, what result I saw, what it proved or disproved.

### Attempt 1 — Add missing direct deps to electron package.json
**Change:** Added `@anthropic-ai/claude-agent-sdk`, `@ai-sdk/openai-compatible`, `@openrouter/ai-sdk-provider`, `ai`, `papaparse` to `packages/electron/package.json`.
**Result:** First error (`Cannot find module '@anthropic-ai/claude-agent-sdk'`) went away. New error surfaced: `@ai-sdk/gateway` missing (transitive of `ai`).
**Proves:** Direct deps being listed is necessary but not sufficient — electron-builder doesn't transitively package.

### Attempt 2 — `node-linker=hoisted` in a package-level `.npmrc`
**Change:** `packages/electron/.npmrc` with `node-linker=hoisted`.
**Result:** `packages/electron/node_modules` unchanged (still only 26 direct deps as symlinks). pnpm install doesn't seem to honor per-package `.npmrc` for linker behavior.
**Proves:** Linker config must be set at the workspace root or nowhere.

### Attempt 3 — `hoist-pattern[]=*` + `public-hoist-pattern[]=*` at root `.npmrc`
**Change:** Root `.npmrc` with aggressive hoist patterns.
**Result:** Root `node_modules/@ai-sdk/gateway` became available (symlink), but `packages/electron/node_modules` still only had direct deps — so electron-builder still couldn't see transitives.
**Proves:** Hoisting to the root doesn't fix the packaged tree. electron-builder packages from the electron pkg's own node_modules, not the root.

### Attempt 4 — `node-linker=hoisted` at root `.npmrc`
**Change:** Changed root `.npmrc` to `node-linker=hoisted`.
**Result:** Root `node_modules` went flat (npm-style), but `packages/electron/node_modules` STILL only contained 26 direct deps as symlinks.
**Proves:** Even with `node-linker=hoisted`, pnpm populates workspace packages' `node_modules` only with their declared deps. The flat tree is at the root only.

### Attempt 5 — `pnpm --filter @shepai/electron deploy --prod --legacy <dir>`
**Change:** Added `scripts/package.mjs` that runs `pnpm deploy` into a staged dir before electron-builder.
**Result:** Staged dir had a complete flat `node_modules` tree (WITH transitives). BUT electron-builder logged `pm=pnpm searchDir=<staged> … no node modules found in collection, trying next search directory` and fell back to the monorepo root — still packaged only direct deps from the electron package.
**Proves:** electron-builder's pnpm-mode collector doesn't recognize the `pnpm deploy` output as a pnpm tree (no `.pnpm/` store in it). It auto-walks up looking for `.pnpm/` and finds the monorepo root.

### Attempt 6 — Switch staging from pnpm to `npm install --omit=dev`
**Change:** `scripts/package.mjs` now: (1) copies `packages/electron/package.json` into `staged-<variant>/`, (2) writes a `.npmrc` stub there to hide pnpm config, (3) runs `npm install --omit=dev --ignore-scripts`. Produces a vanilla npm flat `node_modules`.
**Result:** electron-builder logs `pm=npm searchDir=<staged>` — RECOGNIZES IT as an npm tree. Packaged asar now contains `@ai-sdk/gateway`, `electron-window-state`, and every transitive.
**Proves:** npm's flat tree is the natively-supported shape for electron-builder. This is the correct staging strategy for a pnpm monorepo.
**Status:** ✅ **LANDED** and green for the "missing dep" class of errors.

### Attempt 7 — Pin `electronVersion` in builder configs
**Change:** Added `electronVersion: '36.9.5'` to both `electron-builder.yml` and `electron-builder.apps-only.yml`.
**Reason:** `pnpm deploy --prod` (and `npm install --omit=dev`) strip the `electron` devDep from the staged tree. Without a pinned version electron-builder bails with `Cannot compute electron version from installed node modules`.
**Result:** Build proceeds through packaging. Post-build metadata still logs `Cannot read properties of null (reading 'provider')` because there's no `publish` config, but the `.AppImage` is produced on disk before the error.
**Status:** ✅ Working. The `null provider` error is cosmetic / auto-update-only.

### Attempt 8 — Reroute `extraResources` paths from `../../web` → `web`
**Change:** Both builder YMLs now reference local `./web`; `scripts/package.mjs` copies `<root>/web` into `staged-<variant>/web` during staging.
**Reason:** electron-builder runs in `staged-<variant>/`, so `../../web` would resolve to `packages/electron/web` (doesn't exist) not `<root>/web`.
**Status:** ✅ Working.

### Attempt 9 — `NODE_PATH` patch in electron main to bridge asar → web
**Change:** `packages/electron/src/main.ts` now does:
```ts
if (app.isPackaged) {
  const asarNodeModules = path.join(process.resourcesPath, 'app.asar', 'node_modules');
  process.env.NODE_PATH = `${process.env.NODE_PATH ?? ''}${path.delimiter}${asarNodeModules}`;
  (Module as unknown as { _initPaths: () => void })._initPaths();
}
```
**Result:** ❌ **Did not fix the Turbopack `externalRequire` failure.** Next server started, page request crashed with the exact same `Cannot find module 'next/dist/compiled/next-server/app-*-turbo.runtime.prod.js'` error from the `[turbopack]_runtime.js` chunk.
**Why it might not work:** Turbopack's `externalRequire` function in `[turbopack]_runtime.js:535` is a wrapped `require` that is created at build time with a fixed resolver hint — possibly using `createRequire(import.meta.url)` or the web chunk's own `__dirname` — and ignores the process-wide `NODE_PATH`. Needs investigation.

### Attempt 10 — (planned) Enable `output: 'standalone'` in next.config + run standalone server
**Status:** NOT STARTED.
**Plan:** Set `output: 'standalone'` in `src/presentation/web/next.config.ts`. Rebuild web. The resulting `web/.next/standalone/` is self-contained (has its own `server.js` + `node_modules` that includes `next/dist/compiled/...`). Update the electron main / `WebServerService` to invoke the standalone server instead of the programmatic `next()` API.
**Risk:** Changes how the web server starts in EVERY mode (dev, CLI, electron). Needs compatibility guard.

### Attempt 11 — (alternative to 10) Ship `next` inside `resources/web/node_modules/`
**Status:** NOT STARTED.
**Plan:** In `scripts/package.mjs`, after the npm install, also run `npm install next@16.1.6 --prefix staged-<variant>/web`, so the web tree has its own sibling `next/`. Node's walk-up from `web/.next/server/chunks/` finds `web/node_modules/next/` → resolves. Costs ~100 MB of duplication in the installer.

### Attempt 12 — Use Next.js standalone build's `node_modules` as `web/node_modules` (SUCCESS)

**Change:**
1. Added `output: 'standalone'` to `src/presentation/web/next.config.ts`.
2. Amended `package.json > build:web:prod` to STOP removing `.next/standalone/node_modules/` and instead COPY it to `web/node_modules/`. The rest of the `web/` output (`web/.next/`, `web/public/`, `web/package.json`, synthetic `web/next.config.mjs`) stays as before.
3. The electron stager (`packages/electron/scripts/package.mjs`) still copies the whole `web/` folder into `staged-<variant>/web/`, so this new `web/node_modules/` rides along.

**Result:**
- `web/node_modules/next/dist/compiled/next-server/app-route-turbo.runtime.prod.js` now exists in the packaged app's resources.
- Electron main launches; Next server starts on :4050; `curl http://localhost:4050/applications` → **HTTP 200** with full HTML.
- Zero "Cannot find module" errors in the main-process log.

**Why it works:** Next's standalone build generates a self-contained `node_modules/` tree under `.next/standalone/` that contains exactly the runtime deps the compiled chunks reference (including the non-experimental `app-*-turbo.runtime.prod.js` flavours). By placing that tree at `web/node_modules/`, Node's ordinary walk-up from `web/.next/server/chunks/` finds every referenced file without ever needing to cross the `app.asar` boundary. The `NODE_PATH` main-process patch from Attempt 9 is no longer load-bearing (can be kept as defensive depth or removed).

**Status:** ✅ Code change landed locally on this branch. Pending user ack that the AppImage visibly works on their screen before the Status header above flips to DONE.

---

## Current Code Changes (uncommitted on this branch)

| File | Change |
|------|--------|
| `packages/electron/package.json` | +10 direct deps (transitives of core that the bundle references); new `build:apps-only:*` scripts that go through `scripts/package.mjs` |
| `packages/electron/scripts/build.mjs` | Reads `SHEP_SHELL_VARIANT` env at build time; bakes value into bundle via esbuild `define`; `checkBundledRequires()` sanity check post-build |
| `packages/electron/scripts/package.mjs` | NEW — stages electron package + `dist/` + `resources/` + `web/` into `staged-<variant>/`, runs `npm install --omit=dev`, then electron-builder. Copies the right builder YAML into place so `-c` is not needed. |
| `packages/electron/electron-builder.yml` | `extraResources.from` → `./web`; `electronVersion: '36.9.5'` pinned; explicit `node_modules/**/*` in `files:` |
| `packages/electron/electron-builder.apps-only.yml` | NEW — slim variant with `appId: ai.shep.apps`, `productName: Shep Apps`, output dir `release-apps-only/`, variant-aware `artifactName` |
| `packages/electron/src/main.ts` | `NODE_PATH` bridge in packaged mode (Attempt 9; present but INSUFFICIENT for the remaining Turbopack issue) |
| `packages/electron/.gitignore` | Ignore `staged-*/`, `release-apps-only/` |
| `.github/workflows/ci.yml` | New `build-electron-apps-only` matrix job (sibling of `build-electron`, fully parallel); added to release `needs:` |

---

## Reproduction Commands

From the monorepo root:

```bash
pnpm install
pnpm run build:release                                      # web UI + CLI
pnpm --filter @shepai/electron run build:apps-only:linux    # produces release-apps-only/Shep Apps-*.AppImage
env -u ELECTRON_RUN_AS_NODE \
  "packages/electron/release-apps-only/Shep Apps-0.0.0-linux-x86_64.AppImage" --no-sandbox
```

`ELECTRON_RUN_AS_NODE` must be UNSET; if it's `1` in the shell, the Electron binary runs as Node (prints Node's `--help`) instead of launching the GUI.

---

## Next Concrete Step

**Go with Attempt 10 (`output: 'standalone'`).** It is the Next.js-blessed path for self-contained production deployments, and it removes the asar-to-web resolver gap by design.

Edit plan:
1. `src/presentation/web/next.config.ts` — add `output: 'standalone'`.
2. `scripts/package.mjs` — prefer `web/.next/standalone/` if it exists, copy that verbatim into `staged-<variant>/web/`.
3. electron main / `WebServerService` — detect packaged mode and launch `node .next/standalone/server.js` via child_process, port-bridged to the main process.
4. Verify AppImage boots, applications list renders, user acks. Update the **Status** header above.

If Attempt 10 proves too invasive to restructure server startup, fall back to Attempt 11 (ship `next` in `web/node_modules/`) as the pragmatic duplicate-bytes-for-correctness trade-off.

---

## Append-on-update protocol

When a new attempt is made:
1. Append a new `### Attempt N — <title>` section with `Change`, `Result`, `Proves`, `Status`.
2. Update the **Status** header at the top of this file if the overall state changed.
3. When the user acks the AppImage works, change Status to **DONE — validated by user on <date>** and the file can be deleted or archived.
