# shep2

Shep: go to sleep with issues, wake up with pull requests.

```bash
npx shep2            # run once
npm install -g shep2 # install the `shep` command
```

This package is a small launcher. npm also installs one of the packages below, matched to your
machine through their `os` and `cpu` fields, and the launcher runs the native `shep` binary
from it:

| Package              | Machine                |
| -------------------- | ---------------------- |
| `shep2-darwin-arm64` | macOS, Apple silicon   |
| `shep2-darwin-x64`   | macOS, Intel           |
| `shep2-linux-x64`    | Linux, x86_64 (static) |
| `shep2-linux-arm64`  | Linux, arm64 (static)  |

If you install with optional dependencies turned off (`--omit=optional`), no binary arrives
and `shep` says so. Other ways to install:

```bash
curl -fsSL https://shep.bot/install | sh
brew install shep-ai/tap/shep
```

Source and docs: https://github.com/shep-ai/shep/tree/main/shep2
