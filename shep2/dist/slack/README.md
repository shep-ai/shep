# Shep's Slack app

Shep has no server. Each workspace makes its own small Slack app from `manifest.yaml`, and
Shep connects to Slack from your machine over Socket Mode. Nothing needs a public URL.

## Make the app

1. Open [api.slack.com/apps](https://api.slack.com/apps) → **Create New App** → **From a
   manifest**, pick your workspace, and paste `manifest.yaml`. Socket Mode, the events
   (`reaction_added`, `app_mention`) and interactivity (the Merge / Send back buttons) are
   already on.
2. **Install to Workspace** and allow it. Then **OAuth & Permissions** shows the **Bot User
   OAuth Token** (`xoxb-…`).
3. **Basic Information** → **App-Level Tokens** → **Generate Token and Scopes**: any name, the
   scope `connections:write`. Copy the token (`xapp-…`). Shep uses it only to open its socket.
4. Run `shep config --connect slack` (or connect Slack in the Mac app) and paste both tokens.
   They go to your keychain, never to Shep's settings.
5. Invite Shep to the channels where work is handed over: `/invite @Shep` in `#bugs`, `#eng`, ….
   Shep only sees reactions and threads in channels it is in.

## Handing work over

- React with `:sheep:` on any message, or write "@Shep tonight" in a thread.
- Shep answers in the thread right away ("Got it. I'll work on this tonight at 23:00 in
  acme/storefront and reply here."), asks its questions there, and in the morning posts the
  pull request, the proof and **Merge** / **Send back** / **Open PR** buttons.
- To send the work back, reply in the thread starting with `shep:` and say what to change.

Shep hears Slack only while it runs: a reaction made while your machine is off is not
delivered later. When no "Got it" reply appears, react again once Shep is running.

## What each scope is for

| Scope                                | For                                                  |
| ------------------------------------ | ---------------------------------------------------- |
| `reactions:read`                     | the `reaction_added` event (`:sheep:`)               |
| `app_mentions:read`                  | the `app_mention` event ("@Shep tonight")            |
| `channels:history`, `groups:history` | reading the message and its thread replies           |
| `channels:read`, `groups:read`       | listing Shep's channels for onboarding suggestions   |
| `chat:write`                         | thread replies, and private answers to button clicks |
| `files:write`                        | attaching screenshots to the morning reply           |
