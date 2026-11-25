# Shep 2 distribution

Everything that turns the `shep` binary into something people can install. Nothing here is
published from a laptop: `.github/workflows/shep2-release.yml` does that when a `shep2-v*` tag
is pushed.

| Channel  | Command                                    | Made from                                     |
| -------- | ------------------------------------------ | --------------------------------------------- |
| Homebrew | `brew install shep-ai/tap/shep`            | `homebrew/shep.rb.template` → `shep-ai/homebrew-tap` |
| curl     | `curl -fsSL https://shep.bot/install \| sh` | `install.sh`                                  |
| npm      | `npx shep2` / `npm install -g shep2`       | `npm/shep2/` + `npm/stage.mjs`                |

All three install the same release tarballs.

## Targets and names

| Machine              | Rust target                  | Tarball                                         | npm package          |
| -------------------- | ---------------------------- | ----------------------------------------------- | -------------------- |
| macOS, Apple silicon | `aarch64-apple-darwin`       | `shep-<v>-aarch64-apple-darwin.tar.gz`          | `shep2-darwin-arm64` |
| macOS, Intel         | `x86_64-apple-darwin`        | `shep-<v>-x86_64-apple-darwin.tar.gz`           | `shep2-darwin-x64`   |
| Linux x86_64         | `x86_64-unknown-linux-musl`  | `shep-<v>-x86_64-unknown-linux-musl.tar.gz`     | `shep2-linux-x64`    |
| Linux arm64          | `aarch64-unknown-linux-musl` | `shep-<v>-aarch64-unknown-linux-musl.tar.gz`    | `shep2-linux-arm64`  |

Linux builds are static (musl), so they run on any distribution. Each tarball holds
`shep-<v>-<target>/shep` and `LICENSE`, next to a `.sha256` file in `sha256sum` format. The
target list lives in `npm/shep2/lib/platforms.mjs`; `test/consistency.test.mjs` fails if the
workflow matrix or the formula template drifts from it, and `test/install.test.mjs` installs
every target through `install.sh`'s own detection.

## Files

| File                          | Does                                                                 |
| ----------------------------- | -------------------------------------------------------------------- |
| `version.sh`                  | Prints the version (`[workspace.package]` in `shep2/Cargo.toml`)     |
| `package.sh`                  | Binary → `shep-<v>-<target>.tar.gz` + `.sha256`                       |
| `install.sh`                  | The curl installer (POSIX sh; verifies SHA-256; `~/.local/bin`)      |
| `npm/shep2/`                  | The wrapper package: `bin/shep` launcher, `lib/` (resolution, run)   |
| `npm/stage.mjs`               | Release tarballs → publishable npm packages + `publish-order.txt`    |
| `homebrew/shep.rb.template`   | The formula, with per-target URL and sha256 placeholders             |
| `homebrew/render-formula.mjs` | Template + checksums → `shep.rb`                                     |
| `dry-run.sh`                  | The local end-to-end check below                                     |
| `test/`                       | node:test suites for all of the above                                |

## Checking it locally

```bash
node --test shep2/dist/test/*.test.mjs    # unit + install.sh tests (local HTTP server)
shellcheck --shell=sh shep2/dist/*.sh
sh shep2/dist/dry-run.sh                  # full dry run for this machine
```

`dry-run.sh` builds `shep` for this machine's release target with
`cargo build --release --locked -p shep-cli --target <target>`, packages it with `package.sh`,
installs it with `install.sh` from a `file://` copy of the release, stages and `npm pack`s the
npm packages and installs them offline into a temp project, renders the Homebrew formula when
all four tarballs are present, and checks that every installed `shep` prints the packaged
binary's `--help` (commands `add`, `go`, `config`; bare `shep` is the board) and passes exit
codes through. It publishes nothing and works in a temp dir (`--keep` keeps it).

On Linux the build needs the musl target and C compiler once:

```bash
(cd shep2 && rustup target add x86_64-unknown-linux-musl)   # aarch64-… on arm64
sudo apt-get install musl-tools
```

`sh shep2/dist/dry-run.sh --artifacts <dir>` skips the build and checks tarballs made elsewhere;
the workflow's `verify` job runs it that way on Linux x86_64, Linux arm64 and macOS arm64.

## Cutting a release

1. Set `version` in `[workspace.package]` of `shep2/Cargo.toml` and merge it.
2. Optionally run the workflow by hand (Actions → Shep 2 Release → dry run ticked).
3. Tag and push: `git tag shep2-v0.1.0 && git push origin shep2-v0.1.0`.

The workflow refuses a tag that does not match `Cargo.toml`. It builds and verifies, creates the
GitHub release (`--latest=false`, so Shep 1 keeps "Latest"), then publishes npm packages
(binaries first, then `shep2`; versions already on npm are skipped, so re-running is safe) and
pushes `Formula/shep.rb` to the tap after installing and testing it with `brew` on macOS.

`install.sh` finds the newest version from the repository's `shep2-v*` tags (Shep 1's `v*` tags
and pre-releases are ignored), so it needs no change per release.

## Publishing the launcher as `shep`

If the `shep` name on npm is transferred, publish the same launcher under it, keeping the
`shep2-*` binary packages:

```bash
node shep2/dist/npm/stage.mjs --version 0.4.0 --artifacts release --out npm-out \
  --name shep --wrapper-version 6.0.0
```

That stages `shep@6.0.0` depending on `shep2-<os>-<cpu>@0.4.0`; `shep2` keeps being published
as before and works as the alias. Add the extra `stage.mjs` run to the workflow's npm job then.

## What the owner sets up once

- npm: `shep2` and the four `shep2-*` packages each list this repository's
  `shep2-release.yml` as a trusted publisher (package Settings → Trusted publishing), so the
  workflow publishes with OIDC and provenance and needs no token; `NPM_TOKEN` is only a
  fallback. npm is dropping direct publishing with 2FA-bypassing tokens in January 2027.
- Homebrew: the tap is [`shep-ai/homebrew-tap`](https://github.com/shep-ai/homebrew-tap). The
  workflow pushes to it with a write deploy key (it can reach that one repository only), whose
  private half is the secret `HOMEBREW_TAP_DEPLOY_KEY`. To create or rotate it:

  ```bash
  ssh-keygen -t ed25519 -N "" -C "shep2-release CI (homebrew-tap)" -f tap-key
  gh repo deploy-key add tap-key.pub --repo shep-ai/homebrew-tap \
    --title "shep2-release CI (write)" --allow-write
  gh secret set HOMEBREW_TAP_DEPLOY_KEY --repo shep-ai/shep < tap-key
  rm tap-key tap-key.pub
  ```

- `https://shep.bot/install`: `shep-ai/website`'s nginx redirects it to
  `https://raw.githubusercontent.com/shep-ai/shep/main/shep2/dist/install.sh`, so the
  installer on `main` is always the one served (`curl -fsSL` follows the redirect).
