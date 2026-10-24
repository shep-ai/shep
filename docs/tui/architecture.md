# TUI Architecture

Architecture patterns for the Shep AI terminal UI layer.

## Design Principles

1. **CLI-integrated**: Wizards are invoked from CLI commands, not standalone
2. **Composable prompts**: Each prompt is a reusable configuration, wizards compose them into flows
3. **Fallback to non-interactive**: Every wizard supports `--flags` for CI/scripting bypass
4. **Consistent theming**: All prompts use the Shep theme for colors and symbols

## Wizard Pattern

A wizard is an async function that orchestrates multiple prompts into a multi-step flow:

```typescript
// src/presentation/tui/wizards/agent-config.wizard.ts
import { select, confirm, password } from '@inquirer/prompts';

export interface AgentConfigResult {
  agentType: string;
  authMethod: string;
  token?: string;
}

export async function agentConfigWizard(): Promise<AgentConfigResult> {
  // Step 1: Select agent
  const agentType = await select({ ... });

  // Step 2: Select auth method
  const authMethod = await select({ ... });

  // Step 3: If token, get token
  if (authMethod === 'token') {
    const token = await password({ ... });
    return { agentType, authMethod, token };
  }

  return { agentType, authMethod };
}
```

## Integration with CLI Commands

CLI commands detect whether to run interactive or non-interactive mode:

```typescript
// In command handler
if (options.agent && options.auth) {
  // Non-interactive: use flags directly
  result = { agentType: options.agent, authMethod: options.auth };
} else {
  // Interactive: launch wizard
  result = await agentConfigWizard();
}
```

## Prompt Configuration Pattern

Reusable prompt configurations are extracted to separate files:

```typescript
// src/presentation/tui/prompts/agent-select.prompt.ts
import { listAgentDescriptors } from '@shepai/core/domain/shared/agent-catalog.js';

export function createAgentSelectConfig() {
  const t = getTuiI18n().t;
  const choiceKey = (key: string, field: string) =>
    `tui:prompts.selectAgent.choices.${key}.${field}`;

  return {
    message: t('tui:prompts.selectAgent.message'),
    choices: listAgentDescriptors().map((descriptor) => {
      const name = t(choiceKey(descriptor.i18nKey, 'name'), { defaultValue: descriptor.label });
      if (!descriptor.supported) {
        return {
          name,
          value: descriptor.type,
          disabled: t(choiceKey(descriptor.i18nKey, 'disabled'), { defaultValue: '(Coming Soon)' }),
        };
      }
      return {
        name,
        value: descriptor.type,
        description: t(choiceKey(descriptor.i18nKey, 'description'), {
          defaultValue: descriptor.description,
        }),
      };
    }),
    theme: shepTheme,
  };
}
```

The choice list is **derived from `AGENT_CATALOG`**, never hand-written — a newly supported
agent appears in the picker as soon as its catalog row exists, ordered by `descriptor.order`,
and `supported: false` rows render disabled with a "Coming Soon" badge. The previous
hand-maintained array had silently omitted `llmproxy`, leaving a working agent unreachable
from `shep settings`.

Translations are looked up under `tui:prompts.selectAgent.choices.<i18nKey>.{name,description,
disabled}` across all nine locales in `translations/`, with the catalog's own English text as
the fallback, so a locale that has not caught up never hides a working agent.

## Theming

Custom Inquirer theme integrates with the CLI design system colors:

```typescript
// src/presentation/tui/themes/shep.theme.ts
import { colors } from '@/presentation/cli/ui';

export const shepTheme = {
  prefix: { idle: colors.brand('?'), done: colors.success('✓') },
  style: {
    highlight: (text: string) => colors.brand(text),
    disabled: (text: string) => colors.muted(text),
  },
};
```

## Directory Structure

```
src/presentation/tui/
├── index.ts                    # Barrel exports
├── wizards/                    # Multi-step wizard flows
│   ├── agent-config.wizard.ts  # Agent selection + auth config
│   ├── merge-review.wizard.ts  # Merge/PR review flow
│   ├── plan-review.wizard.ts   # Plan review flow
│   ├── prd-review.wizard.ts    # PRD review flow
│   └── onboarding/             # First-run onboarding wizard
│       ├── onboarding.wizard.ts
│       ├── types.ts
│       └── steps/
│           ├── agent.step.ts
│           ├── ide.step.ts
│           └── workflow-defaults.step.ts
├── prompts/                    # Reusable prompt configurations
│   ├── agent-select.prompt.ts
│   ├── auth-method.prompt.ts
│   ├── ide-select.prompt.ts
│   ├── prd-review-question.prompt.ts
│   └── prd-review-summary.prompt.ts
└── themes/                     # Custom Inquirer themes
    └── shep.theme.ts
```

## Feature Console (`shep tui`, specs 142 and 143)

A full-screen, live view of every feature, modelled on oh-my-pi's Agent Hub
(`docs/competitors/oh-my-pi.md`). It is the first TUI surface that is not a wizard.

```
shep tui (tui.command.ts)          checks for a TTY, resolves three use cases
  └─ runFeatureConsole              feature-console.app.ts
       ├─ TUI(FullscreenTerminal(ProcessTerminal))   pi-tui diff renderer on the alternate screen
       ├─ FeatureConsoleView                          UI state only: selection, mode, pane
       ├─ every 2s → GetFeatureConsoleSnapshotUseCase (never two reads at once)
       ├─ a / r / s / R → RunFeatureConsoleActionUseCase
       └─ l → GetFeatureLogTailUseCase (refreshed with the snapshot while the pane is open)
```

Rules the console follows:

- **No decisions in the view.** State, phase, needs-you, which actions a row offers and the
  row order all arrive in the snapshot. The view shows an action key only when the row's
  `actions` contains it, and the action use case refuses anything else again.
- **One feature state.** `deriveFeatureState` (`domain/shared/feature-state.ts`) is shared with
  the web canvas and feature tree, so every surface agrees.
- **Exactly one screen.** `render(width)` returns `terminal.rows` lines, none wider than `width`.
  With the alternate screen this makes pi-tui's inline diff renderer a full-screen one.
- **Outside text is sanitised.** Log lines and error messages pass through `sanitizeText`, so an
  agent's output can never move the cursor or change colours inside the console.
- **The terminal is always restored.** `q`, `ctrl+c`, `SIGTERM` and `SIGHUP` all go through one
  `finish()` that stops polling, stops pi-tui and leaves the alternate screen.

pi-tui (MIT, Node >= 20) was chosen over oh-my-pi's fork, which needs Bun and a Rust addon, and
over Ink, which needs React >= 19.3. See `specs/142-tui-feature-console/research.yaml`.

### Terminal panes, filter and alerts (spec 143)

```
t / T / f / F → OpenFeaturePaneUseCase                 application/use-cases/feature-console/
                  ├─ feature by id or prefix, directory: worktree on disk, else repository
                  ├─ command: none (the user's shell) or <shep> feat logs -f <id>
                  └─ ITerminalPaneLauncher (port)
                       detect()  domain/shared/terminal-multiplexer.ts
                                 TMUX → ZELLIJ → WEZTERM_PANE → KITTY_WINDOW_ID, SHEP_MULTIPLEXER overrides
                       open()    infrastructure/services/terminal-pane/
                                 multiplexer-commands.ts: one pure argv builder per multiplexer
                                 terminal-pane-launcher.service.ts: runs it through ExecFunction
              ◄── Opened | Inline { cwd, command } | Failed
Inline → the app stops pi-tui, run-inline.ts runs the command on this terminal
         (ctrl+c ignored by the console until the child exits), then restarts and redraws
/      → filterConsoleRows (core, pure) applied by ConsoleRoster on every keystroke
alerts → terminal-notification.ts for features that start needing the user
```

- **Argv only.** Every multiplexer command is an array; no shell string is built, so a branch
  name or path cannot become a command. tmux format-expands `-c`, so `#` is doubled.
- **Same data in the pane.** The console passes `SHEP_HOME` to the pane (tmux `-e`, kitty
  `--env`, an `env K=V` prefix for Zellij and WezTerm on POSIX).
- **Session variables, not `TERM`.** `TERM` and `TERM_PROGRAM` survive into nested shells and
  ssh sessions with no multiplexer to talk to, so they never enable panes.
- **Alerts reach the right tab.** Terminal escape sequences, not the desktop notifier the daemon
  already uses: the terminal knows whether it is focused and which tab rang. The first snapshot
  never rings.

### Command palette (spec 145)

`ctrl+p` or `:` lists every console command that applies to the selected feature
(`console-palette.ts`), with its key. An entry *is* a `ConsoleKey`: enter replays that key through
the view's browse handler, so the palette runs the same guarded path as the key and can never
offer an action the core did not put in `row.actions`. Adding a console command is one row in
the palette table. `c` copies the feature id over OSC 52 (works over ssh and through tmux).

### Control center and tmux status (spec 146)

```
C → ControlCenter.open (control-center.ts)
      candidates: active features (isActiveFeatureState) with a run and no window yet
      └─ OpenControlCenterUseCase → OpenFeaturePaneUseCase per feature (Log, Window, title)
                                    → launcher.open returns the window id the multiplexer printed
every snapshot → ControlCenter.sync
      renames: tracked windows whose state symbol changed
      status:  tmuxStatusOptions(summary) when it changed (@shep_status, @shep_needs_you)
      └─ UpdateMultiplexerStatusUseCase → launcher.renameWindow / publishStatus
           (detects the multiplexer itself; outside one it does nothing)
```

A window the user closed fails its next rename; the console forgets it, and `C` can open it
again. `shep tui --status [plain|tmux]` prints `formatStatusSegment(summary)` once.

### Attach and steer (spec 147)

```
o → ChatView (chat-view.ts) fills the body; the message line is the status line
      ConsoleChat (console-chat.ts) polls while attached, every 750 ms
        └─ GetFeatureChatUseCase → GetInteractiveChatStateUseCase
             entries: user / assistant / tool / block / answer (FeatureChatEntryKind), newest last
             busy (ChatTurnStatus.Processing or booting), streamingText, the open question(s)
enter → SendFeatureChatMessageUseCase → SendInteractiveMessageUseCase (worktree, else repository)
1-9 / typed answer → AnswerFeatureChatQuestionUseCase → RespondToInteractionUseCase (by question text)
quit → StopFeatureChatsUseCase for every chat this process started
```

"Attach" talks to the feature's **interactive chat**, not the headless background worker: one
conversation per feature, persisted, shown identically by the web Chat tab. Interactive sessions
live in the process that boots them, so the console stops the ones it started before it exits.
With `SHEP_MOCK_EXECUTOR=1` the mock interactive executor answers deterministically (one tool
call, a quote of the message; "ask me" asks a two-option question), which the e2e test drives.

The tools this follows (workmux, oh-my-pi, claude-squad, Claude Code agent teams) are compared in
[docs/competitors/agent-harness-tui.md](../competitors/agent-harness-tui.md).

## Testing Strategy

- **Unit tests**: Mock `@inquirer/prompts` imports, test wizard logic and result mapping
- **Integration tests**: Test CLI command with `--flag` bypass (non-interactive)
- **E2E tests**: `tests/e2e/tui/` drives the real CLI in a pseudo-terminal (`node-pty`) and reads
  the screen through `@xterm/headless` (`tests/helpers/tui/pty-screen.ts`). Waits are
  condition-based with a deadline, never fixed sleeps.
- **Console unit tests**: the view renders against a fake terminal size; the app runs against
  `tests/helpers/tui/fake-terminal.ts` with fake use cases.
- **Pane e2e**: `tests/e2e/tui/feature-console-tmux.test.ts` runs the console as the only pane
  of a private tmux server (`tmux -L`), presses keys with `send-keys`, and asks tmux which panes
  opened, where, and running what.
