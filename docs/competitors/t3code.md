# T3 Code

> The open-source "agent harness control surface": one fast GUI over the coding-agent CLIs you already pay for, on web, desktop and phone.

|             |                                                                      |
| ----------- | -------------------------------------------------------------------- |
| **GitHub**  | [github.com/pingdotgg/t3code](https://github.com/pingdotgg/t3code)   |
| **Tagline** | "The open-source control plane for coding agents"                    |
| **Type**    | Node WebSocket server + React web app + Electron + React Native      |
| **Pricing** | Free. Bring your own subscription (no keys resold)                   |
| **License** | MIT                                                                  |
| **Scale**   | Claims 400,000+ users (`AGENTS.md`); PR numbers past #17,100         |

Researched against `pingdotgg/t3code@a4c9494b` (2026-10-08) and Shep `main@0304cfc` (v1.236.0).

---

## What It Is

T3 Code wraps the providers on your machine — Codex (app-server JSON-RPC), Claude Code (Agent SDK
pointed at your own `claude` binary), Cursor (SDK), Grok, OpenCode, Pi, and any ACP Registry
agent — behind one event-sourced server. Web, desktop and mobile clients all talk to that server
over one WebSocket.

The unit of work is a **thread**: a conversation with one agent, optionally in its own worktree.
You prompt it, answer its questions and approvals in the composer, review per-turn diffs, then
commit, push and open a PR with one button. The thread "settles" (archives itself) when the PR
merges.

Its stated non-negotiables are **open**, **performance**, **remote-ready** and **multi-surface**.
Its design rule, from Theo in `AGENTS.md`: *"Do not preserve complexity just because it already
exists. Do not introduce machinery because it looks architecturally impressive… Fight scope
creep."*

### Key Features

- **Inline decisions in the composer.** Questions, approvals and plan review all reuse the one
  composer instead of opening modals (details below).
- **Per-turn checkpoints** stored as hidden git refs. You get a diff for any turn and "edit from
  here" with or without reverting files.
- **Fan-out.** Shift-click several models to send one prompt to several worktrees at once.
- **Mid-thread provider switch.** It hands over a budgeted slice of the transcript, not an LLM
  summary.
- **Remote by design.** Options are a LAN pairing QR, `tailscale serve`, SSH-launched remote
  servers, and T3 Connect (a hosted relay). It also has a native iOS/Android app with push for
  "needs approval" and "asks input".
- **Inbox-style thread lifecycle**: pin, snooze (including "until usage limit resets"), settle,
  and an undo toast instead of confirm dialogs.
- **PR review inside the app**, plus a `watch_pull_request` MCP tool that wakes the agent on CI
  failure or review.
- **MCP for outside agents.** Claude Code, ChatGPT and others can list, start and steer threads
  through scoped OAuth.
- **Usage page** that pools token use and subscription limits across providers and accounts.
- **Keyboard-first**: about 60 rebindable commands with `when` clauses, and number keys in every
  picker.
- **Performance budgets enforced by tests**: a cold open of about 75 rows / 1 MiB, tool output
  left off the wire, and 50 ms coalescing of streamed updates.

---

## The "Inline Options" Pattern

This is the feature worth studying most closely.

**Protocol.** Each provider's question tool is normalized into one contract
(`packages/contracts/src/providerRuntime.ts`):

```ts
UserInputQuestion { id, header, question,
  options: [{ label, description, value? }],
  multiSelect?, allowCustomAnswer? }
```

Every question is stored as a durable `RuntimeRequest` with a `responseCapability`, which takes
one of three values:

- `live`: the provider is blocked waiting on the answer.
- `message`: an async question; the answer becomes a new user message, so it survives restarts.
- `not_resumable`: the process is gone. The UI says so instead of showing a dead button.

Claude's `AskUserQuestion` and `ExitPlanMode` are intercepted in `canUseTool`. The plan tool is
*denied*, and its plan is captured as a `proposed_plan` artifact, so T3 owns plan approval.

**UI** (`apps/web/src/components/chat/ComposerPendingUserInputPanel.tsx`, 312 lines):

- The panel attaches to the top of the composer. It is not a modal and not a timeline card.
- Option rows show a bold label and a muted description. On the right is a `1`–`9` key hint,
  which turns into a check mark when selected.
- Single-select shows the check optimistically, then **auto-advances after 200 ms**. Multi-select
  toggles in place.
- **The composer itself is the "Other" field** ("Type your own answer, or leave this blank to use
  the selected option"). Typed text outranks the selection. Clicking an option moves any typed
  text into the normal draft, so nothing is lost.
- Multi-question prompts are paged (`n/N`, Previous / Next / Submit). Enter always means
  "advance". Each question can take attachments.
- Once answered, the request collapses to a one-line **"Answered questions"** row in the
  timeline.
- The same mode-switching applies to approvals and plans:
  - Approvals: Decline and Approve, with other options in an overflow menu that can show
    warnings.
  - Plans: the primary button reads **Refine** when you have typed something and **Implement**
    when you have not.
  - Task lists live in a composer badge, not in the timeline.

---

## How Shep Compares

The two products overlap in their parts list but not in their job.

|                        | T3 Code                                         | Shep                                                            |
| ---------------------- | ----------------------------------------------- | --------------------------------------------------------------- |
| **Unit of work**       | Thread (a conversation)                         | Feature (idea → spec → code → PR → merge)                       |
| **Human role**         | Drives every turn                               | Approves gates, answers questions, presses merge                |
| **Primary surface**    | Composer + timeline                             | Control-center canvas + feature drawer + CLI                    |
| **Agent execution**    | Long-lived provider sessions over SDK/RPC       | LangGraph nodes spawning headless CLIs; chat for Claude/Cursor  |
| **Spec pipeline**      | None (plan mode only)                           | Requirements / research / plan YAML with approval gates         |
| **CI auto-fix**        | Agent can opt in via `watch_pull_request`       | Built into the pipeline                                         |
| **Remote**             | Pairing, Tailscale, SSH, relay, native mobile   | `SHEP_ALLOW_PUBLIC_BIND`, WhatsApp/Telegram remote control      |
| **Scope discipline**   | Explicit "fight scope creep" rule               | ~321k prod LOC, roughly half outside the core loop (see below)  |
| **Telemetry**          | PostHog, server-side, **on by default**         | None. README: "Nothing is sent to Shep servers"                 |

**Positioning.** T3 Code is a **cockpit**: the best place to work *with* agents. Shep is an
**autopilot**: the place that ships PRs *while you are not watching*. Shep should not try to out-T3
T3 at interactive chat. It has 400k users, a performance obsession, and a team merging about 25
PRs a day.

The insight to borrow sits where the two meet. In an autopilot, **the few moments when the
human is asked something are the product.** Each one should take a single keystroke, from any
surface, with a recommended answer already chosen. T3 Code has polished exactly those moments.
Shep has three half-built versions of them.

---

## What Shep Should Take

Ordered by value per unit of effort.

### 1. One "Decision" primitive, rendered inline everywhere (highest value)

**Today, Shep has three renderers and three option shapes for "agent asks, user picks":**

| Renderer | Option shape |
| --- | --- |
| `InteractionBubble` (chat) | `{label, description, preview}` |
| `PrdQuestionnaire` (spec gates) | `{id, label, rationale, recommended}` |
| Agent-questions inbox | `string[]` |

**Things that are broken now:**

- `AgentQuestionExecutorBridge` is never constructed in production. Chat questions never reach the
  inbox.
- Gate questions show up in the inbox as a raw `JSON.stringify` blob.
- `preview` is declared but never rendered.
- The chat bubble sits in `afterMessages`, below the timeline, instead of where the question was
  asked.

**What to build:**

- **One TypeSpec model.** A `Decision` with:
  - options `{id, label, description, preview?, recommended?}`
  - `multiSelect` and `allowCustom`
  - a `responseMode` enum: `Live | Async | NotResumable`
  - an optional `defaultAfter` deadline
- **One web component** with T3's interaction model: number keys, a check that auto-advances after
  200 ms, the composer as "Other", paging, a collapsed "answered" row, and a cleared state for
  not-resumable questions.
- **One CLI renderer** for the same model (Inquirer).
- **Every producer goes through it:** chat `AskUserQuestion`, spec gates, merge review, the
  supervisor, and the inbox. Wire the bridge or delete it.

**The Shep-specific twist: "ask, don't guess, but never block forever."**

- Headless prompts currently say *"Do NOT ask the user questions"* (`fast-implement.prompt.ts`).
  An async decision with a recommended option and a deadline would let a background agent ask
  when it is genuinely unsure.
- The question goes to the inbox or a notification. If nobody answers before the deadline, the
  agent proceeds with the recommendation, and that is logged.
- Autonomy is preserved and control is offered.
- Measure it with *decisions per merged PR* and *time-to-answer* (see Metrics).

### 2. Plan capture by intercepting `ExitPlanMode`

- Capture Claude's plan-tool input as a structured artifact and deny the tool with "plan
  captured, wait".
- This gives the plan gate a real object rather than a parsed transcript.
- Pair it with T3's *Refine / Implement* button on the gate.

### 3. Hidden-ref checkpoints per phase

- Capture each node's result to `refs/shep/checkpoints/<feature>/<node>`. Use a temporary
  `GIT_INDEX_FILE`, then `write-tree`, `commit-tree` and `update-ref`.
- Shep's worktrees are already isolated, so this is nearly free.
- It gives per-phase diffs ("what did *implement* change vs. *repair*?") and rollback of a single
  phase without touching the branch.

### 4. Provider capabilities instead of provider names

- Record capabilities such as `canResume`, `canFork`, `supportsSteering`, `supportsQuestions` and
  `pendingRequestsSurviveRestart` in the agent catalog. Have policy code branch on those.
- This is the natural next step for the existing `IAgentExecutorProvider` rule and
  `AGENT_CATALOG`.
- Also copy T3's rule that **health probes must have no side effects**: no hooks, no MCP servers,
  no sessions.

### 5. Structured protocols over CLI scraping (medium term)

- Drive Codex through `codex app-server` (typed JSON-RPC: approvals, questions, resume, fork,
  rollback) instead of parsing `exec` output.
- Use ACP for Gemini-class and registry agents.
- Shep already uses ACP for Cursor chat. Extending it brings questions and approvals to
  background runs on more providers.

### 6. Phone-grade remote, without a native app

- For an autopilot, the phone use case is narrow: *answer a decision, approve a gate, press
  merge*.
- T3's cheap pieces cover it:
  - a pairing token in the URL **fragment**, exchanged for a *scoped* session (read vs. operate);
  - `tailscale serve --bg --https=<port>` as a zero-infrastructure route;
  - web push from the existing notification watcher.
- This could replace both the Telegram/WhatsApp gateway and the Baileys WhatsApp stack.

### Smaller things worth copying

- **Undo toasts instead of confirmation dialogs** for archive, delete and reject.
- **"Settle" semantics.** When a merged PR settles the feature, also clean up the worktree. Keep
  T3's guards: no newer user activity, no live run, no manual override. Compare these against
  Shep's existing auto-archive watcher.
- **`AGENTS.md` process-safety rules:**
  - Never kill processes by name pattern; an agent's own argv contains the worktree path.
  - Use a per-worktree data home and derived ports.

## What Shep Should *Not* Take

- **A chat-first thread GUI and composer power features** (stash, queue/steer, about 60
  keybindings, VS Code theme import, prompt history). They serve T3's job, not Shep's. Shep's chat
  should stay a secondary surface.
- **A native mobile app, the T3 Connect relay (Clerk + Cloudflare), Electron auto-update with
  trial-and-rollback.** These represent years of surface. The PWA, push and Tailscale route
  covers Shep's need.
- **A rewrite onto Effect-TS or full event sourcing.** Borrow the *ideas* surgically:
  - a transactional outbox, if daemon-crash recovery of runs is a real pain;
  - a sequence cursor for the feature stream, if polling becomes the bottleneck.
- **In-app browser, device simulators, HTML "visual replies", MCP Apps.** Impressive, but
  peripheral to "merge real PRs".
- **T3's telemetry defaults**: on by default, env-var-only opt-out, and identity hashed from the
  user's Claude/Codex account ID. Shep's delivery design should follow T3's; its consent and
  identity design should not (see below).

---

## Where Shep Is Today and What to Cut

### How Shep got here

From full git history: 1,182 commits from 2026-02-02 to 2026-10-05, about 783 of them excluding
releases, and overwhelmingly AI co-authored.

| Period | What happened |
| --- | --- |
| Feb–Mar | The core loop was built in about 830 commits: the feature agent, executors, worktrees, PRs, CI fix, the canvas, and settings. |
| Apr | Expansion: apps, cloud deploy, Electron, plane-like project management, multi-provider SDK. |
| May | Supervisor and agent questions. |
| Jun | A single 93k-line commit (#740) merged 17 open PRs: clusters, supply-chain security, workflows, plugins, messaging, MCP. |
| Sep | Kimi, dev-server autodetect, fleet. |
| Oct | Query-aware harness (+35k), then the "software factory" (#917, +81k lines, specs 120–132 in one PR, **no feature flag**). |

The result is about **321k production LOC**. About 87k serves the core loop and at least 79k
serves peripheral areas. The web nav has 18 top-level entries.

**The lesson.** With AI-written code, *building* is cheap. *Owning* is not:

- Every surface multiplies against the 9 locales, the CLI/web parity rule, and the 12 agent
  types.
- Big-bang merges let areas land with no usage gate.

T3's discipline points the other way, and the missing piece in Shep is the **decision
infrastructure**: default-off flags plus usage data.

### Cut or hide now

These are not usage questions. Each is a trust, correctness, or strategy fix.

| Area | Action | Why |
| --- | --- | --- |
| Contributor recap and good-first-issue watchers (started in every user's `_serve` daemon), plus the `/onboarding` contributor page | Move to repo tooling or a GitHub Action | Shep-maintainer dogfooding running on users' machines |
| Software factory (spaces, trackers, knowledge, signals, opportunities, feedback, discovery, incidents, outcomes, docs-first, autopilot, factory) | Put behind a flag, **default off** | 17.6k LOC, 3 days old, no flag, adds 5+ nav links and 12 CLI groups. Decide with data. |
| ASPM | Flip `featureFlags.aspm` to **false** | ROADMAP says "behind a flag", but the default is `true`. It is a different product category. |
| Supply-chain security | Fold into ASPM or remove | Untouched since 2026-06-29; overlaps ASPM |
| Cloud deploy stubs (Vercel, Netlify, Amplify, Cloud Run) | Remove the stubs | 4 of 5 providers are "coming soon"; untouched since 2026-05-04 |
| WhatsApp via Baileys | Remove | Our own TypeSpec notes it "violates WhatsApp ToS (ban risk)"; it duplicates the messaging gateway |
| Dead code: unwired `agentQuestionBridge`, unread `system.autoUpdate`, unrendered `preview`, Aider and Continue placeholders | Wire (bridge, via §1) or delete | Zero-risk cleanup |

### Consolidate next

| Overlap | Proposal |
| --- | --- |
| Three memory systems (Shep Brain, Bedrock integration, mempalace plugin) | Keep one |
| Three feature lists (canvas, `/features` table, SDLC board) | Keep the canvas plus one table |
| Project management, trackers and spaces | Integrate with Linear/Jira (trackers) rather than being a PM tool; retire the plane-like PM |
| Clusters/k8s, query-aware harness, scheduled workflows | Keep them default-off; consider moving them to plugins or out of the npm package |
| 9 locales (35k lines of JSON; newer screens already untranslated) | English plus machine translation in CI, or fewer locales |

### Decide with data (after 30–60 days of metrics)

Electron desktop, the in-browser IDE tab (with the `node-pty` native addon), webhooks,
project-management pages, and each software-factory page.

**Proposed rule going forward:**

- Any new top-level area ships behind a default-off flag and emits a page-view event.
- It becomes default-on only after the data supports it.

---

## Metrics: Knowing Whether Anyone Uses Shep

Shep sends nothing today. The README promises *"Nothing is sent to Shep servers — there are
none."* Adding telemetry is therefore a **trust change**, not just a code change. It needs the
README, the FAQ and `CLAUDE.md` ("There is no Shep server") updated in the same release.

### Design (borrowing T3's delivery, not its defaults)

**Identity**

- A random `installId` (UUID) stored in settings.
- **Never** derived from a Claude, Codex or GitHub account. No person profiles, and IP/GeoIP
  capture disabled.

**Consent**

- Recommended: the dev-CLI norm (Next.js, Turborepo, Astro). Telemetry is on, with a clear
  first-run notice in both the CLI and the web onboarding. The web onboarding also offers a
  one-click off.
- **Off automatically** when `CI` is set, when `DO_NOT_TRACK=1` or `SHEP_TELEMETRY_DISABLED=1`,
  and in tests.
- `shep telemetry on|off|status`, plus a settings toggle.
- Fully opt-in is the conservative alternative. It is safest under GDPR but yields far less data.
  **This is the one product and legal decision for you to make.**

**Transparency**

- Events go into a local SQLite `telemetry_outbox` table before anything is sent.
- `shep telemetry show` prints exactly what will be sent.

**Delivery**

- Shep is multi-process (CLI, daemon, feature-agent workers). Every process writes to the outbox;
  only the daemon sends.
- The daemon flushes on a watcher interval, like the existing notification and archive watchers.
- PostHog `/batch` over plain `fetch` (no SDK, EU host), batches of about 20.
- A UUID per event for dedup, jittered backoff, a drop after 5 attempts, and a cap on the table
  size.
- Without a daemon running, events wait for the next daemon start.

**Content boundary**

- Never prompts, code, paths, repo or branch names, feature titles, error messages, or IDs that
  link back to content.
- Only enums, counts, durations (bucketed) and versions.

**Architecture**

- A `TelemetryConfig` in `tsp/domain/entities/settings.tsp`.
- A `TelemetryEvent` TypeSpec enum (no raw event strings).
- An `ITelemetry` output port that use cases receive through `@inject`.
- A PostHog adapter, plus `NoopTelemetry` for tests, in infrastructure.

### Events: about ten, each answering a question

| Event | Key properties | Answers |
| --- | --- | --- |
| `install.heartbeat` (once a day per install) | version, OS/arch, Node version, install method (npx / global / electron), agent types configured, enabled flags, counts of repos and active features | Daily, weekly and monthly actives; retention; version spread; which agents matter |
| `cli.command` | command path only (`feat new`, never args), exit status | Is the CLI used, and which commands? |
| `web.area.viewed` | route *template* (`/aspm/findings`), never IDs | **Which areas to cut** |
| `feature.created` | source (cli / web / mcp), mode (fast / spec), agent type | Activation and the funnel top |
| `feature.run.finished` | terminal status, phases run, CI-fix attempts, duration bucket | Reliability per agent |
| `pr.opened` / `pr.merged` | agent type, mode | **North star: merged PRs per weekly-active install** |
| `decision.answered` | kind, surface, latency bucket, picked the recommended option? | Whether inline decisions work |
| `onboarding.step` | step, completed | Where new users drop off |
| `error.unhandled` | error class and source hash (no message) | Crash rate per version |

**Activation metric**: the first PR opened within 24 hours of install.

**Next step.** Per `CLAUDE.md`, start this with `/shep-kit:new-feature` as two specs: *telemetry*
and *unified decisions*. Then take the "cut or hide now" table as a separate cleanup PR.
