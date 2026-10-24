# CLI Architecture

## Bootstrap Sequence

Entry point: `src/presentation/cli/index.ts`

The `bootstrap()` function runs four sequential steps:

1. **Initialize DI container** -- `initializeContainer()` opens SQLite, runs migrations, registers repositories and use cases. Exposes the container on `globalThis.__shepContainer` for the web UI's server-side code.
2. **Initialize settings** -- Resolves `InitializeSettingsUseCase` from the container, executes it to load/create settings, then calls `initializeSettings(settings)` to populate the singleton.
3. **Initialize i18n** -- Reads `settings.user.preferredLanguage` (default `en`) and initializes the CLI and TUI translation layers in parallel. Failure here is non-fatal: the CLI falls back to English rather than refusing to start.
4. **Configure Commander** -- Creates the root `Command('shep')` with the name, description and version from `IVersionService`, registers subcommands, calls `program.parseAsync()`. The default action (no subcommand) starts the daemon via `startDaemon()`.

```typescript
async function bootstrap() {
  await initializeContainer();
  (globalThis as Record<string, unknown>).__shepContainer = container;

  const initializeSettingsUseCase = container.resolve(InitializeSettingsUseCase);
  const settings = await initializeSettingsUseCase.execute();
  initializeSettings(settings);

  const language = getSettings().user?.preferredLanguage ?? 'en';
  await Promise.all([initCliI18n(language), initTuiI18n(language)]);

  const versionService = container.resolve<IVersionService>('IVersionService');
  const { version, description } = versionService.getVersion();

  const program = new Command()
    .name('shep')
    .description(description)
    .version(version, '-v, --version', 'Display version number')
    .action(async () => {
      await startDaemon();
    });

  program.addCommand(createVersionCommand());
  program.addCommand(createSettingsCommand());
  // ... all other commands
  await program.parseAsync();
}
```

**There is no onboarding gate in `bootstrap()`.** The bare `shep` default action
calls `startDaemon()` and nothing else; first-run onboarding is completed in the
web UI, which `startDaemon()` opens in the browser once the server is ready.
`shep feat new` has its own, separate TTY-only onboarding gate
(`feat/new.command.ts`) that runs `onboardingWizard()` before creating a
feature — that gate is specific to that command.

`reflect-metadata` is imported at the very top of the file (before any other imports) as required by tsyringe.

## Command Structure Pattern

Every command is a factory function returning a `Command` instance:

```typescript
export function createXxxCommand(): Command {
  return new Command('name')
    .description('...')
    .addOption(...)
    .addHelpText('after', '...')
    .action((options) => { ... });
}
```

### Conventions

- **Factory function**: Named `create<Name>Command()`, exported from `<name>.command.ts`.
- **Command groups**: A parent command file (`index.ts`) adds child commands via `.addCommand()`. See `commands/settings/index.ts`.
- **Options**: Use `new Option(...)` with `.choices()` for enum-like values, `.default()` for defaults.
- **Help text**: Append examples via `.addHelpText('after', ...)` with leading `$` for command examples.
- **Async commands**: Use `async` action handlers; Commander calls `parseAsync()` to support them.

### File Organization

The file name does not always equal the command name -- `ide-open.command.ts`
registers `new Command('ide')`. The registered name is what ships.

```
commands/
  version.command.ts              # shep version
  run.command.ts                  # shep run
  ui.command.ts                   # shep ui
  start.command.ts                # shep start (daemon)
  stop.command.ts                 # shep stop (daemon)
  restart.command.ts              # shep restart (daemon)
  status.command.ts               # shep status (daemon)
  ps/ps.command.ts                # shep ps, shep ps stop (spec 144)
  _serve.command.ts               # shep _serve (hidden, internal daemon child)
  upgrade.command.ts              # shep upgrade
  install.command.ts              # shep install
  ide-open.command.ts             # shep ide   <- file name != command name
  tools.command.ts                # shep tools (group)
  doctor.command.ts               # shep doctor
  review.command.ts               # shep review (group)
  security.command.ts             # shep security (group)
  mcp.command.ts                  # shep mcp
  log-viewer.ts                   # Log viewing utility (not a command)
  settings/                       # shep settings (group)
  feat/                           # shep feat (group)
  agent/                          # shep agent (group, incl. message/ + questions/)
  repo/                           # shep repo (group)
  session/                        # shep session (group)
  app/                            # shep app (group, incl. deploy/ git/ cloud-providers/)
  cluster/                        # shep cluster (group)
  dev/                            # shep dev (group, incl. plan sub-group)
  project/                        # shep project (group)
  item/                           # shep item (group)
  cycle/                          # shep cycle (group)
  intake/                         # shep intake (group)
  notifications/                  # shep notifications (group, alias `notif`)
  supervisor/                     # shep supervisor (group)
  bedrock/                        # shep bedrock (group)
  contributors/                   # shep contributors (group, GitHub Actions entry points)
  whatsapp/                       # shep whatsapp (group)
  aspm/                           # shep aspm (group)
  plugin/                         # shep plugin (group)
  workflow/                       # shep workflow (group)
  fleet/                          # shep fleet (group)
  daemon/
    start-daemon.ts               # Daemon start logic (spawns `shep _serve`)
    stop-daemon.ts                # Daemon stop logic
```

See [commands.md](./commands.md) for the full per-command reference.

To add a new command group:

1. Create `commands/<group>/index.ts` with `createGroupCommand()`.
2. Add subcommand files as `<action>.command.ts`.
3. Register via `program.addCommand(createGroupCommand())` in `index.ts`.

## DI Integration

Commands access application services through two mechanisms:

### Container resolution (for use cases)

```typescript
import { container } from '@/infrastructure/di/container';
const useCase = container.resolve(SomeUseCase);
await useCase.execute();
```

Used during bootstrap for `InitializeSettingsUseCase`.

### Settings singleton (for configuration)

```typescript
import { getSettings } from '@/infrastructure/services/settings.service';
const settings = getSettings(); // Returns Settings object
```

The `getSettings()` singleton is the preferred way to access settings in command handlers. It avoids re-resolving from the DI container on every call. The singleton is set once during bootstrap; commands that change settings refresh it after the database write rather than mutating it ad hoc — `updateSettings(newSettings)` for an in-place refresh, or `resetSettings()` + `initializeSettings()` to replace it outright (what `settings init` does). The instance is stored on `globalThis`/`process` rather than in a module-level variable, so it survives Turbopack module re-evaluation inside the web UI's API routes.

## Error Handling

### Command-level errors

Each command action wraps its body in `try/catch`. On error:

- Call `messages.error(message, error)` to display the error.
- Set `process.exitCode = 1` (do not call `process.exit()` from command handlers).

```typescript
.action((options) => {
  try {
    // command logic
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    messages.error('Failed to do X', err);
    process.exitCode = 1;
  }
});
```

### Bootstrap-level errors

Bootstrap wraps the entire sequence in `try/catch`. Each step has its own inner `try/catch` that logs the specific error with `messages.error()`, then re-throws. The outer catch calls `process.exit(1)`.

### Global handlers

Registered at module level for safety:

- `process.on('uncaughtException', ...)` -- logs and exits.
- `process.on('unhandledRejection', ...)` -- logs and exits.

### Debug output

Error stack traces are only printed when the `DEBUG` environment variable is set. This applies to `messages.error()` and `messages.debug()`. `DEBUG` is a plain truthy check (`if (process.env.DEBUG)`), not a namespace filter -- use `DEBUG=1`, not `DEBUG=shep:*`.

## Help Text Conventions

- Root command starts the daemon by default (no arguments).
- `--version` / `-v` prints version number only.
- `version` subcommand prints detailed info (name, description, Node version, platform).
- Command groups show their subcommand list when invoked without a subcommand.
- Examples in `addHelpText('after', ...)` use `$ shep <command>` prefix format.
