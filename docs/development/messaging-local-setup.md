# Messaging Remote Control — Local Setup

This guide walks you through running the Commands.com Gateway locally and
pairing a Telegram bot with Shep end-to-end.

## Architecture

```
Telegram bot webhook
        │
        ▼
cloudflared / ngrok  ──►  Gateway (localhost:8080)  ◄──ws──  Shep daemon
                                                              (shep _serve)
```

- The **inbound** leg (Telegram → Gateway) needs a public URL, so you tunnel
  localhost with `cloudflared` or `ngrok`.
- The **outbound** leg (Shep → Gateway WebSocket) stays on localhost because
  the daemon runs on the same machine.
- Shep also makes direct **outbound HTTPS calls to `api.telegram.org`** for
  replies and notifications — the gateway tunnel is only for inbound.

## Prerequisites

- Go 1.25+
- Node 22+ with pnpm
- A Telegram bot token from [@BotFather](https://t.me/BotFather)
- `cloudflared` (`brew install cloudflared`) _or_ `ngrok`

## 1. Run the Gateway

```bash
git clone https://github.com/Commands-com/gateway.git
cd gateway
cp .env.example .env
cat >> .env <<EOF
JWT_SIGNING_KEY=$(openssl rand -base64 48)
AUTH_MODE=demo
OAUTH_DEFAULT_CLIENT_ID=commands-desktop-public
REDIRECT_ALLOWLIST=http://localhost:61696/callback,urn:ietf:wg:oauth:2.0:oob
EOF
go run ./cmd/server
```

Verify:

```bash
curl http://localhost:8080/healthz
# {"status":"ok"}
```

Open [http://localhost:8080/console](http://localhost:8080/console) to see
devices, sessions, and integration routes.

## 2. Expose the Gateway publicly

Pick one. Both support WebSocket upgrades, which is required because the
Gateway's built-in console uses them.

### cloudflared (no signup)

```bash
cloudflared tunnel --url http://localhost:8080
# => Your quick tunnel: https://random-slug.trycloudflare.com
```

### ngrok

```bash
ngrok http 8080
# => https://abcd-1234.ngrok-free.app
```

Export the URL for the next steps:

```bash
export SHEP_GATEWAY_PUBLIC_URL=https://random-slug.trycloudflare.com
```

## 3. Export your Telegram bot token

Shep needs the bot token to make outbound `sendMessage` calls (the Gateway
does not proxy outbound traffic).

```bash
export SHEP_TELEGRAM_BOT_TOKEN=123456:ABCDEFG-your-token-here
```

`_serve` reads this from `process.env` when constructing the messaging
service — see [container.ts](../../packages/core/src/infrastructure/di/container.ts).

## 4. Pair Shep with Telegram

Start the web UI so you can use the pairing dialog (the CLI wizard works
identically):

```bash
pnpm dev:web      # http://localhost:3000
# or
shep ui           # http://localhost:4050
```

Navigate to **Settings → Messaging Remote Control**:

1. Flip **Enable messaging** on
2. Gateway URL: `http://localhost:8080` (not the public URL — the daemon
   connects to the Gateway on localhost)
3. Click **Pair device** on **Telegram**

A dialog opens showing:

- A **6-digit pairing code**
- A **Webhook URL** in the form `http://localhost:8080/integrations/{route_id}/{route_token}`

Because the daemon sees the Gateway on localhost but Telegram needs a
public URL, rewrite the webhook URL host to your tunnel domain:

```bash
# Example
ROUTE_PATH=$(curl -s http://localhost:8080/gateway/v1/integrations/routes \
  -H "Authorization: Bearer $(cat ~/.shep/.gateway-token)" | jq -r '.routes[0] | "/integrations/\(.route_id)/\(.route_token)"')
WEBHOOK_URL="${SHEP_GATEWAY_PUBLIC_URL}${ROUTE_PATH}"
```

or just copy the route_id/route_token from the dialog and build the URL
yourself: `${SHEP_GATEWAY_PUBLIC_URL}/integrations/{route_id}/{route_token}`.

Set the Telegram webhook:

```bash
curl -X POST "https://api.telegram.org/bot${SHEP_TELEGRAM_BOT_TOKEN}/setWebhook" \
  -d "url=${WEBHOOK_URL}"
# {"ok":true,"result":true,"description":"Webhook was set"}
```

Verify:

```bash
curl -s "https://api.telegram.org/bot${SHEP_TELEGRAM_BOT_TOKEN}/getWebhookInfo" | jq
```

## 5. Start the daemon

```bash
shep _serve
# or during development:
pnpm dev:cli _serve
```

The daemon:

1. Resolves `IGatewayClient` and calls `fetchAccessToken` (demo mode uses
   the `commands-desktop-public` client, no secret required).
2. Constructs `MessagingService` with the fetched token + your bot token.
3. Opens the WebSocket tunnel with `Authorization: Bearer <token>` on the
   upgrade headers.
4. Sends `tunnel.activate` for each paired platform's route.
5. Begins listening for `tunnel.request` frames.

## 6. Pair from your phone

In your Telegram bot chat, send the 6-digit code:

```
/pair 482913
```

The daemon's `MessagingService.handleTunnelRequest`:

1. Receives the `tunnel.request` frame
2. Parses the body as a Telegram `Update`
3. Matches `/pair <code>` via `parsePairCommand`
4. Looks up `pendingPairingCode` for Telegram in settings
5. Calls `ConfirmMessagingPairingUseCase` → sets `paired: true`, stores your
   chat ID
6. Replies: _"Paired with Shep. You can now send commands like /status,
   /list, or /help."_

The web UI will show the row flip to **Paired** with your chat ID on the
next render.

## 7. Drive Shep from your phone

```
/list                    — list features
/status 42               — status of feature 42
/new add dark mode       — create a new feature
/approve 42              — approve an agent run
/chat 42                 — start an interactive agent relay for feature 42
<any text while relay>   — forwarded to the agent as a user message
/end                     — end the active relay
/help                    — command reference
```

Replies come back through `sendMessage` directly to your chat.

### Interactive chat relay

`/chat <feature_id>` attaches your Telegram chat to a feature's interactive
session. While a relay is active:

- Every message you send is forwarded to
  [IInteractiveSessionService.sendUserMessage](../../packages/core/src/application/ports/output/services/interactive-session-service.interface.ts).
- Agent streaming output is buffered in 3-second windows and flushed to the
  chat as normal Telegram messages (to avoid flooding).
- `/end` tears down the subscription and stops forwarding.

The daemon will start a new session if none exists, and queue messages if
the session is still booting. You can drive an entire conversation from
Telegram without touching the web UI.

## Bot token storage

The daemon needs your Telegram bot token to call `sendMessage`. You have
two options:

1. **Settings UI** (recommended for real use) — after pairing, a **Bot API
   token** field appears below the Telegram row. It's stored as an encrypted
   string in `settings.db` and loaded by DI on daemon start.
2. **Environment variable** (quick dev) — export
   `SHEP_TELEGRAM_BOT_TOKEN` before running `shep _serve`. Settings takes
   precedence when both are set.

The same pattern applies to the CLI wizard: after `/confirm pairing`, it
prompts for the bot token and stores it in settings via
`UpdateSettingsUseCase`.

## Troubleshooting

**Tunnel refuses the upgrade with 401.** The daemon's OAuth token fetch
failed. Check that `OAUTH_DEFAULT_CLIENT_ID=commands-desktop-public` is set
on the Gateway and that `gatewayClientId` in Shep settings matches (or is
unset — it defaults to the same value).

**`/pair <code>` gets "Invalid or expired pairing code".** Codes expire
after 10 minutes. Start a new pairing from the UI.

**Webhook POSTs return 503.** Either the daemon isn't running, the tunnel
is disconnected, or the route hasn't been activated yet. Check
`adapter.isRouteActivated(routeId)` — in logs you'll see `tunnel.activate`
followed by `tunnel.activate.result ok:true` when healthy.

**Notifications don't arrive in Telegram.** Check that
`SHEP_TELEGRAM_BOT_TOKEN` is set in the environment the daemon runs in —
this is separate from the Gateway token. The `TelegramMessageSender` will
silently no-op if the bot token is missing.

## Limitations

- **WhatsApp inbound is parsed and routed**, but WhatsApp **outbound** is not
  implemented — the daemon will accept `/pair` and `/chat` commands from
  WhatsApp but cannot reply. Replies would need a dedicated WhatsApp Cloud
  API client (separate Meta verified app + access token). Use Telegram
  end-to-end for now.
- Pairing codes are stored on the settings row (not in a separate table).
  They survive daemon restarts but expire after 10 minutes.
