# Web UI Development Notes

## Running the UI

There are two distinct ways to run the web UI. **Always test in BOTH modes.**

### 1. Dev Mode (local development)

```bash
pnpm dev:web
```

- Uses `dev-server.ts` which initializes the DI container and starts Next.js in dev mode
- Turbopack HMR enabled
- Runs on port 3000 by default

### 2. Production Mode (how users run it)

```bash
shep ui
# or
pnpm dev:cli ui
```

- The CLI bootstraps the DI container (`src/presentation/cli/index.ts`), then starts Next.js via `WebServerService`
- Runs on port 4050 by default
- This is how real users experience the UI
- **IMPORTANT**: Always test real-time features in this mode, not just dev mode

### Key Differences Between Modes

| Aspect             | Dev Mode (`pnpm dev:web`)                               | Production Mode (`shep ui`)                             |
| ------------------ | ------------------------------------------------------- | ------------------------------------------------------- |
| Entry point        | `dev-server.ts`                                         | `cli/index.ts` -> `ui.command.ts` -> `WebServerService` |
| Port               | 3000                                                    | 4050                                                    |
| DI container       | Set on `globalThis.__shepContainer` in dev-server.ts:73 | Set in cli/index.ts:76                                  |
| WebSocket upgrades | Guarded, then forwarded (`createUpgradeListener`)       | Guarded and forwarded in dev only (none in prod)        |
| Next.js mode       | Always dev                                              | dev when run from source, prod when installed           |

## Graph State Architecture (Domain-Model-Driven)

All canvas node/edge state is managed through **domain Maps as the single source of truth**.

```
Server (layout.tsx)                    Client (useGraphState)
┌──────────────────┐                  ┌─────────────────────────────┐
│ initialNodes[]   │──parseMaps──→    │ Domain Maps (source of truth)│
│ initialEdges[]   │                  │  featureMap: Map<id, Entry>  │
└──────────────────┘                  │  repoMap: Map<id, Entry>     │
                                      │  pendingMap: Map<id, Entry>  │
SSE Events                            │                              │
┌──────────────────┐                  └──────────┬──────────────────┘
│ NotificationEvent│──updateFeature──→           │
└──────────────────┘                             │ deriveGraph() + layoutWithDagre()
                                                 ▼
Optimistic UI                         ┌─────────────────────────────┐
┌──────────────────┐                  │ Derived (read-only)          │
│ shep:feature-    │──addPending───→  │  nodes: CanvasNodeType[]     │
│ created event    │                  │  edges: Edge[]               │
└──────────────────┘                  │  (callbacks + layout applied)│
                                      └─────────────────────────────┘
```

### Key Files

| File                                                             | Purpose                                                              |
| ---------------------------------------------------------------- | -------------------------------------------------------------------- |
| `lib/derive-graph.ts`                                            | Pure function: domain Maps → nodes + edges (with callbacks injected) |
| `hooks/use-graph-state.ts`                                       | Hook: domain Maps state + reconciliation + derivation + layout       |
| `components/features/control-center/use-control-center-state.ts` | Wraps useGraphState, handles server actions + SSE events             |
| `components/features/control-center/control-center-inner.tsx`    | Wires callbacks via `setCallbacks()`, passes nodes/edges to canvas   |
| `components/features/features-canvas/features-canvas.tsx`        | Renders React Flow; only adds `selectedFeatureId` highlighting       |

### Design Principles

1. **Domain Maps are the source of truth** — all mutations go through Maps (featureMap, repoMap, pendingMap)
2. **Edges are derived, never stored** — repo→feature edges from `repositoryPath` matching, dep edges from `parentNodeId`
3. **Callbacks via ref** — `callbacksRef` + stable `useMemo([])` wrapper prevents circular re-renders
4. **Layout in derivation** — `layoutWithDagre` runs inside `useMemo` after `deriveGraph()`
5. **`onNodesChange` is a no-op** — since `nodesDraggable=false`, we ignore all React Flow changes

### Mutation Paths

| Operation         | Flow                                                                                                    |
| ----------------- | ------------------------------------------------------------------------------------------------------- |
| SSE event         | `useAgentEventsContext` → `updateFeature(nodeId, {state, lifecycle})`                                   |
| Server prop sync  | `useEffect` watches `initialNodeKey` → `reconcile(newNodes, newEdges)`                                  |
| Optimistic create | `shep:feature-created` event → `createFeatureNode()` → `addPendingFeature()`                            |
| Delete feature    | `handleDeleteFeature()` → `removeFeature()` → server action → `restoreFeature()` on error               |
| Add repository    | `handleAddRepository()` → `addRepository(tempId)` → server action → `replaceRepository(tempId, realId)` |

### Reconciliation

`reconcile(newNodes, newEdges)` merges server data into domain Maps:

- Replaces featureMap and repoMap with fresh server data
- Preserves pending (creating) features in featureMap unless matched by `name + repositoryPath`
- Cleans pendingMap entries that now have a real counterpart in server data

## SSE / Real-Time Update Architecture

```
DB polling (500ms) -> /api/agent-events (SSE route)
    -> Service Worker (public/agent-events-sw.js, single connection)
        -> postMessage to all browser tabs
            -> useAgentEvents hook (hooks/use-agent-events.ts)
                -> AgentEventsProvider context (hooks/agent-events-provider.tsx)
                    -> useControlCenterState (SSE effect calls updateFeature)
                        -> domain Maps update -> derivation -> React Flow canvas
```

### SSE Key Files

| File                                                             | Purpose                                                |
| ---------------------------------------------------------------- | ------------------------------------------------------ |
| `app/api/agent-events/route.ts`                                  | SSE endpoint, polls DB every 500ms, emits delta events |
| `app/api/agent-events/health/route.ts`                           | Health check: `/api/agent-events/health`               |
| `public/agent-events-sw.js`                                      | Service Worker: multiplexes single SSE to all tabs     |
| `hooks/use-agent-events.ts`                                      | Client hook: registers with SW, receives events        |
| `hooks/agent-events-provider.tsx`                                | React context wrapping `useAgentEvents`                |
| `components/features/control-center/use-control-center-state.ts` | SSE effect calls `updateFeature()` on domain Maps      |
| `components/common/feature-node/derive-feature-state.ts`         | Maps event types/phases to UI state/lifecycle          |

### SSE Lifecycle Mappings

The SSE route maps `SdlcLifecycle` enum -> agent graph node names -> client `FeatureLifecyclePhase`:

```
SdlcLifecycle.Started     -> 'requirements'  -> 'requirements'
SdlcLifecycle.Analyze     -> 'analyze'       -> 'requirements'
SdlcLifecycle.Requirements-> 'requirements'  -> 'requirements'
SdlcLifecycle.Research    -> 'research'      -> 'research'
SdlcLifecycle.Planning    -> 'plan'          -> 'implementation'
SdlcLifecycle.Implementation -> 'implement'  -> 'implementation'
SdlcLifecycle.Review      -> 'merge'         -> 'review'
SdlcLifecycle.Maintain    -> 'maintain'      -> 'maintain'
SdlcLifecycle.Blocked     -> 'blocked'       -> 'requirements'
```

## React Flow Rendering (CRITICAL)

React Flow v12 (`@xyflow/react` ^12.10.0) has specific behaviors that affect real-time updates:

- **Controlled mode**: `<ReactFlow nodes={nodes}>` passes nodes as props
- **Internal Zustand store**: React Flow syncs props to an internal `nodeLookup` Map via `StoreUpdater`
- **Memoized NodeWrapper**: Each node is wrapped in `memo(NodeWrapper)` which subscribes to store via `useStore(selector, shallow)`
- **NodeWrapper gets node from store**, NOT from props directly. It does `s.nodeLookup.get(id)` with `shallow` comparison
- **Single ReactFlowProvider**: There must be exactly ONE `ReactFlowProvider` ancestor. Multiple nested providers create separate stores

### Circular Update Loop Prevention

With the domain-model-driven architecture, the circular update loop is prevented by design:

1. **Callbacks are stable** — injected via `callbacksRef` + stable `useMemo([])` wrapper, so node objects don't change when callbacks change
2. **`onNodesChange` is a no-op** — domain Maps are the source of truth, React Flow's internal changes are ignored
3. **`enrichedNodes` only adds `selectedFeatureId`** — no callback injection in FeaturesCanvas

**NEVER** make `onNodesChange` apply `replace` changes back to state.

## Testing Real-Time Updates

1. Start the UI in the mode you want to test
2. Check SSE health: `curl http://localhost:<port>/api/agent-events/health`
3. Check SW status in browser: `navigator.serviceWorker.controller?.state` should be "activated"
4. Trigger state changes: `pnpm dev:cli feat approve <id>` or start a new feature run
5. Watch both **sidebar** and **canvas nodes** - they should both update
6. Check browser console for errors
7. Check server logs for `[SSE] emit:` messages confirming events are sent

## Optimistic Feature Creation Flow

When a user creates a feature, the UI uses optimistic updates:

1. **Create drawer** dispatches `shep:feature-created` → `createFeatureNode()` → `addPendingFeature()` adds temp node to pendingMap
2. Drawer closes immediately via `router.push('/')`
3. Server action `createFeature` runs in background → agent starts
4. SSE events arrive with real feature ID (`feat-<uuid>`) — these update featureMap via `updateFeature()`
5. **Server prop sync** (rerender with new initialNodes) → `reconcile()` detects matching real feature → removes pending from both featureMap and pendingMap

### Key constraints

- **Temp node IDs don't match SSE events**: Optimistic nodes use `feature-<ts>` IDs, server uses `feat-<uuid>`. SSE events call `updateFeature('feat-<uuid>', ...)` which doesn't match the temp ID. The reconcile on next server prop update handles the swap.
- **Create drawer `isSubmitting`**: Must NOT reset until pathname leaves `/create`. Resetting in `.finally()` causes the drawer to flash open because `router.push('/')` is async and pathname hasn't changed yet.
- **Parallel routes preserve state**: The `CreateDrawerClient` component is NOT unmounted on navigation. `isOpen` is derived from pathname, not mount/unmount lifecycle.

## Common Pitfalls

- **No events when nothing changes**: SSE only emits deltas. If no feature state changes, no events are sent. This is correct behavior.
- **Storybook mocks**: New server actions need mocks in `.storybook/mocks/app/actions/` or Storybook build breaks.
- **Map insertion order affects dagre layout**: After remove+restore of a feature, the Map insertion order may change, causing slightly different dagre positions. This is expected behavior — don't write tests asserting exact position preservation across remove/restore cycles.
