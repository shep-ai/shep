# Shep for Mac

The Mac surface of Shep 2 (spec 151, task-13): a SwiftUI app that talks to the Shep daemon over
its Unix socket. Design: [`specs/151-shep-2/design`](../../specs/151-shep-2/design/) (the
`Mac*.png` boards).

| Target | What | Builds on |
| ------ | ---- | --------- |
| `ShepKit` | Protocol types generated from [`../schema/openrpc.json`](../schema/openrpc.json), the JSON-RPC client, socket path resolution, every view model | macOS and Linux (Foundation + Observation only) |
| `ShepApp` (product `Shep`) | SwiftUI + AppKit: review window, needs-you, working, add tasks, dawn, settings, onboarding, menu bar extra, notifications, App Intents | macOS 14+ only (declared only when building on macOS) |

The app holds no logic of its own: views read view models, view models call `ShepClient`.

```bash
swift build && swift test                          # from shep2/macos
python3 ../tools/swift-codegen/generate.py         # after the schema changes
python3 ../tools/swift-codegen/generate.py --check # CI: fails when Generated/ is stale
scripts/make-app.sh                                # macOS: Shep.app with a bundle id and icon
```

Start the daemon first (`shep go`, or `shep __daemon`); the app finds its socket the way the CLI
does (`$SHEP_HOME/shep2/run/daemon.sock`, or `/tmp/shep2-<hash>` for a deep home).

## Protocol

`shep2/tools/swift-codegen/generate.py` (Python 3, standard library) writes
`Sources/ShepKit/Generated/{Models,Methods}.swift`: Codable structs, string enums, serde's
externally tagged enums (`"Merge"`, `{"SendBack":{"note":…}}`), the `ShepMethod` names, params,
a `ShepCalls` protocol with its JSON-RPC implementation, and typed notifications. The schema's
`Task` becomes `ShepTask` so it never hides Swift's `Task`. Never edit the generated files.

`DaemonClient` speaks newline-delimited JSON-RPC 2.0: calls share one connection (reopened if
the daemon restarts); `board.subscribe` and `agent.watch` each get a connection of their own and
come back as `AsyncStream`s. Notifications carry their payload as `params` itself.

Tests: fixtures are replies captured from a real `shep __daemon`; `DaemonClientSocketTests` run
the client over a real Unix socket against a fake server; `LiveDaemonTests` run it against a
running daemon when `SHEP_LIVE_SOCKET` names its socket (start one in a throwaway `SHEP_HOME`,
outside any git repository).

## Built and designed

| Design | Built | Not yet (needs a daemon call or more) |
| ------ | ----- | ------------------------------------- |
| Morning review | Queue by verdict, M / S / J / K / Space / Return / Esc, proof or diff, chips, second opinion, sky brightening per decision | |
| Needs you + diff | Question, answer box, diff by file | Suggested answers (chips) |
| Live working view | The agent's screen as the daemon renders it, activity, elapsed, checks, events, diff, proof, note typed into the agent | Plan checklist, usage line, Stop task, open in Terminal / editor |
| Add tasks | One per line (issue, link, sentence) or by label; tonight or now; rounds estimate | Open-issues list with search and "too vague" flags |
| Dawn | Sky, merged / sent back / waiting, Queue tonight's work, Share the morning (text) | The share card image |
| Settings | Shift start, tasks in parallel, agent, repository | Stop time, usage-limit behaviour, CI fix attempts, brief time, keep awake |
| Onboarding | Eight steps, skipping those the settings satisfy; first task starts now | Detecting installed agents and `gh` sign-in |
| Menu bar, notifications | Menu bar extra (progress, rows, merge all green); morning notification with "Merge N green" / "Review"; needs-you notification with an inline answer | Desktop widget, shift-start notification |
| Dynamic Island | | Live Activity: see below |
| Spotlight / Siri | App Intents: Queue issue, Show ready pull requests, Merge all green | Listed by the system only in an Xcode build (below) |

"Merge all green" merges exactly the tasks the daemon reports green in `Brief.green`, one by
one; the rule for "green" lives only in the daemon.

### Platform limits

- **Live Activity**: as far as we know ActivityKit is iOS/iPadOS only (a Mac can show an
  iPhone's Live Activities, but a Mac app cannot start one), so the app does not use it and the
  menu bar extra is the progress surface. Not verified on a Mac yet: the CI job prints whether
  the runner's macOS SDK has `ActivityKit.framework`.
- **Notifications** need an app bundle. Under `swift run` the process has no bundle identifier
  and the app stays quiet; `scripts/make-app.sh` builds `Shep.app` (ad-hoc signed).
- **App Intents** compile with `swift build`, but the system lists them from metadata that only
  Xcode's build extracts, so Spotlight and Shortcuts show them only in an Xcode-built app.

## Fonts and images

Gloock, Hanken Grotesk and JetBrains Mono are bundled from Google Fonts under the SIL Open Font
License 1.1 (licence texts beside them in `Sources/ShepApp/Resources/Fonts`). If registering
them fails the app falls back to the system font. The sky frames and the lantern come from
`specs/151-shep-2/design/atlas/assets`.
