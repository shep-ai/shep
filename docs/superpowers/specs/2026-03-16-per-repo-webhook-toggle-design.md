# Per-Repository Webhook Enable/Disable

## Problem

The webhook system currently operates as all-or-nothing: it starts automatically with the web server and bulk-registers webhooks for all repos with features in the Review lifecycle. Users have no way to enable or disable webhooks for individual repositories from the UI.

## Solution

Add a per-repo webhook toggle on the repository node (action button) and repository drawer (labeled button with details). The toggle registers or removes a GitHub webhook for that specific repo using the already-running Cloudflare tunnel. When the tunnel is not running, the toggle is disabled with a tooltip.

## Design

### Service Layer

New methods on `GitHubWebhookService`:

- `registerWebhookForSingleRepo(repoPath: string, webhookUrl: string)` — checks if a webhook is already registered for this repo path (after normalizing to forward slashes) and no-ops if so; otherwise delegates to the existing private `registerWebhookForRepo()`
- `removeWebhookForRepo(repoPath: string)` — finds the registered webhook for this repo path (normalized comparison), removes it from GitHub via DELETE API, then removes from the in-memory `registeredWebhooks` array

New methods on `WebhookManagerService`:

- `enableWebhookForRepo(repoPath: string)` — validates tunnel is running (returns `{ success: false, error: "tunnel_not_connected" }` if not), constructs webhook URL as `${tunnelUrl}/api/webhooks/github`, delegates to `GitHubWebhookService.registerWebhookForSingleRepo()`
- `disableWebhookForRepo(repoPath: string)` — delegates to `GitHubWebhookService.removeWebhookForRepo()`
- `isWebhookEnabledForRepo(repoPath: string)` — checks if repo path exists in the registered webhooks list (normalized path comparison)

**Path normalization**: All path comparisons in the service layer normalize to forward slashes before matching (`path.replace(/\\\\/g, '/')`). This applies to `isWebhookEnabledForRepo`, `removeWebhookForRepo`, and the duplicate check in `registerWebhookForSingleRepo`.

These are concrete methods on the service classes, not on `IWebhookService`. This is consistent with how `getStatus()` and `getDeliveryHistory()` already bypass the interface.

### API Layer

Three new endpoints under `/api/webhooks/repos/`:

| Method | Path                          | Body/Query                   | Response                                                            |
| ------ | ----------------------------- | ---------------------------- | ------------------------------------------------------------------- |
| `POST` | `/api/webhooks/repos/enable`  | `{ repositoryPath: string }` | `{ success: boolean, webhook?: RegisteredWebhook, error?: string }` |
| `POST` | `/api/webhooks/repos/disable` | `{ repositoryPath: string }` | `{ success: boolean, error?: string }`                              |
| `GET`  | `/api/webhooks/repos/status`  | `?repositoryPath=...`        | `{ enabled: boolean, webhookId?: number, repoFullName?: string }`   |

All endpoints check `hasWebhookManager()` and return appropriate errors if the system is not initialized. The enable endpoint returns a machine-readable error code when the tunnel is not connected: `{ success: false, error: "tunnel_not_connected" }`.

### UI Layer

#### Repository Node

A new action button in the existing action row (after Open Folder, before Sessions dropdown):

- **Icon**: `Radio` from lucide-react
- **States**:
  - Tunnel not running: disabled, gray icon, tooltip "Webhook unavailable — tunnel not running"
  - Tunnel running, webhook off: enabled, gray icon, tooltip "Enable webhook"
  - Tunnel running, webhook on: enabled, green icon (`text-green-500`), tooltip "Disable webhook"
  - Loading: spinner replacing icon (matches existing ActionButton pattern)
  - Error: red alert icon, auto-clears after 5s (matches existing pattern)

#### Repository Drawer

A new "WEBHOOKS" section below the existing "OPEN WITH" section:

- ActionButton with label text (not icon-only) — "Enable Webhook" / "Disable Webhook"
- When enabled: displays webhook ID and subscribed event badges (`pull_request`, `check_suite`, `check_run`)
- When disabled: just the enable button
- Same disabled state when tunnel is not running

#### Hook: `useWebhookAction`

New hook (similar pattern to `useRepositoryActions`):

- **Input**: `repositoryPath: string | null`
- **Fetches**: webhook status for the repo via `GET /api/webhooks/repos/status` on mount
- **Checks**: tunnel status from `GET /api/webhooks/status` (only reads `tunnel.connected`, ignores the rest) — fetched once on mount, acceptably stale while drawer/node is open
- **Exposes**: `toggle()`, `enabled`, `loading`, `error`, `tunnelConnected`, `webhookId`, `repoFullName`
- **Optimistic updates**: on toggle, immediately flip `enabled` state in the hook before the server responds; on error, roll back to previous state and set `error`
- **Error handling**: auto-clear after 5s (matching `useRepositoryActions` pattern)

No changes to `RepositoryNodeData` — the hook derives everything from `repositoryPath`.

### Testing

| Layer   | Test                                                                         | Approach                                                   |
| ------- | ---------------------------------------------------------------------------- | ---------------------------------------------------------- |
| Service | `enableWebhookForRepo` / `disableWebhookForRepo` / `isWebhookEnabledForRepo` | Unit tests with mocked `execFn` and tunnel service         |
| API     | Enable / disable / status endpoints                                          | Unit tests with mocked webhook manager                     |
| Hook    | `useWebhookAction`                                                           | Unit tests with mocked fetch for all states                |
| UI      | Repository node webhook button                                               | Storybook stories: enabled, disabled, tunnel down, loading |
| UI      | Repository drawer webhook section                                            | Storybook stories with webhook details                     |

### Files to Create

- `src/presentation/web/app/api/webhooks/repos/enable/route.ts`
- `src/presentation/web/app/api/webhooks/repos/disable/route.ts`
- `src/presentation/web/app/api/webhooks/repos/status/route.ts`
- `src/presentation/web/hooks/use-webhook-action.ts`

### Files to Modify

- `packages/core/src/infrastructure/services/webhook/github-webhook.service.ts` — add `registerWebhookForSingleRepo()`, `removeWebhookForRepo()`
- `packages/core/src/infrastructure/services/webhook/webhook-manager.service.ts` — add `enableWebhookForRepo()`, `disableWebhookForRepo()`, `isWebhookEnabledForRepo()`
- `src/presentation/web/components/common/repository-node/repository-node.tsx` — add webhook action button
- `src/presentation/web/components/common/repository-node/repository-drawer.tsx` — add webhooks section
- `src/presentation/web/components/common/repository-node/repository-node.stories.tsx` — add webhook state stories
- `src/presentation/web/components/common/repository-node/repository-drawer.stories.tsx` — add webhook section stories

### Edge Cases

- **Duplicate registration**: `registerWebhookForSingleRepo` checks if a webhook is already registered for the repo path before creating a new one. If already registered, it no-ops and returns the existing webhook.
- **Bulk + manual overlap**: If bulk registration on startup already registered a webhook for a repo, the toggle will show it as enabled. Disabling removes it for the current session. On next restart, bulk registration will re-register it. This is expected behavior given the in-memory non-goal.
- **Tunnel disconnects while webhook is enabled**: The webhook remains registered on GitHub but events will fail delivery. The UI continues to show the webhook as enabled (accurate — it is registered). Re-enabling after tunnel reconnects is not needed since the webhook URL auto-updates via the existing `onUrlChange` handler.

### Non-Goals

- Persisting webhook state across restarts (webhooks are in-memory, cleaned up on shutdown)
- Auto-registering webhooks on startup (existing bulk behavior stays, this is additive)
- Modifying the `IWebhookService` interface
