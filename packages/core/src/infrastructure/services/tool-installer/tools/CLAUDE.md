# Tool JSON Definitions

Each `.json` file defines a development tool that shep can install, verify, and launch.
Files are loaded dynamically by `tool-metadata.ts` — the filename (minus `.json`) becomes the tool ID.

## Schema

| Field              | Type                                        | Required | Description                                                              |
| ------------------ | ------------------------------------------- | -------- | ------------------------------------------------------------------------ |
| `name`             | `string`                                    | Yes      | Human-readable display name                                              |
| `summary`          | `string`                                    | Yes      | One-line description                                                     |
| `description`      | `string`                                    | Yes      | Detailed description                                                     |
| `tags`             | `("ide"\|"cli-agent"\|"vcs"\|"terminal"\|"memory")[]` | Yes      | Categories for filtering in UI and CLI                                   |
| `iconUrl`          | `string`                                    | No       | URL to SVG/PNG icon (use cdn.simpleicons.org when possible)              |
| `binary`           | `string \| Record<string,string>`           | Yes      | Binary name for `which` check. Per-platform map if differs               |
| `packageManager`   | `string`                                    | Yes      | Install method label (apt, brew, curl, manual, download)                 |
| `commands`         | `Record<string,string>`                     | Yes      | Platform-keyed install commands (`linux`, `darwin`)                      |
| `timeout`          | `number`                                    | Yes      | Install timeout in ms (typically 300000)                                 |
| `documentationUrl` | `string`                                    | Yes      | Official docs URL                                                        |
| `verifyCommand`    | `string`                                    | Yes      | Command to verify installation (e.g. `git --version`)                    |
| `autoInstall`      | `boolean`                                   | No       | `true` (default) = run commands automatically. `false` = manual download |
| `required`         | `boolean`                                   | No       | `true` = tool is required for platform to function                       |
| `openDirectory`    | `string \| Record<string,string>`           | No       | Command to open a directory. Use `{dir}` placeholder                     |
| `spawnOptions`     | `object`                                    | No       | Override spawn behavior (see below)                                      |
| `terminalCommand`  | `string \| Record<string,string>`           | No       | Command to open tool in a **new terminal window** from web UI            |

## Spawn Options

GUI tools (IDEs) use defaults: `{ detached: true, stdio: "ignore" }` — fire and forget.
CLI agents need: `{ shell: true, stdio: "inherit", detached: false }` — run in current terminal.

## Terminal Command

CLI agents launched from the web UI have no terminal to inherit. The `terminalCommand` field
provides a platform-specific command that opens a new terminal window:

```json
"terminalCommand": {
  "linux": "x-terminal-emulator -e bash -c 'cd {dir} && exec claude'",
  "darwin": "open -a Terminal.app bash -c 'cd {dir} && exec claude'"
}
```

The launcher auto-detects TTY: CLI launch uses `openDirectory`, web launch uses `terminalCommand`.

## Adding a New Tool

1. Create `<tool-id>.json` in this directory
2. Fill all required fields
3. Validate icon URL returns 200: `curl -sI <url> | head -1`
4. For manual-install tools: set `autoInstall: false`, use plain text in `commands` (no `echo`)
5. For CLI agents: add `spawnOptions` + `terminalCommand`
6. Run `pnpm build && pnpm test:unit` to verify

## Tags

| Tag         | Meaning                        | Examples                |
| ----------- | ------------------------------ | ----------------------- |
| `ide`       | GUI code editor                | VS Code, Cursor, Zed    |
| `cli-agent` | Terminal-based AI coding agent | Claude Code, Cursor CLI |
| `vcs`       | Version control tool           | Git, GitHub CLI         |
| `terminal`  | Terminal emulator/multiplexer  | tmux, Kitty, Alacritty  |
| `memory`    | Project memory / AI context store | Project Bedrock      |

Tools can have multiple tags. A tool appears in all matching filter tabs in the UI.

### Terminal Tools

Terminal tools use the `terminal` tag. GUI terminals (Kitty, Alacritty) use `brew install --cask` on macOS.
CLI tools like tmux use `brew install` (formula). Terminals with `--working-directory` flags can include
`openDirectory` for launch support. tmux requires `spawnOptions` with `shell: true` and `stdio: "inherit"`
since it runs inside the current terminal session.

Example (tmux):

```json
{
  "name": "tmux",
  "summary": "Terminal multiplexer for session management",
  "tags": ["terminal"],
  "binary": "tmux",
  "packageManager": "brew",
  "commands": { "darwin": "brew install tmux", "linux": "apt install -y tmux" },
  "timeout": 300000,
  "documentationUrl": "https://github.com/tmux/tmux/wiki",
  "verifyCommand": "tmux -V",
  "autoInstall": true,
  "openDirectory": "tmux new-session -c {dir}",
  "spawnOptions": { "shell": true, "stdio": "inherit", "detached": false }
}
```
