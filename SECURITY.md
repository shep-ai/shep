# Security Policy

## Supported Versions

| Version | Supported |
| ------- | --------- |
| Latest release | Yes |
| Older versions | No |

We recommend always running the latest version of Shep. Security fixes are applied to the latest release only.

## Reporting a Vulnerability

**Please do not open a public GitHub issue for security vulnerabilities.**

If you discover a security vulnerability, please report it privately by emailing **security@shep.bot**. Include as much detail as possible:

- Description of the vulnerability
- Steps to reproduce the issue
- Potential impact
- Any suggested fixes (optional)

### Reporting channels

| Channel | Status |
| ------- | ------ |
| **security@shep.bot** | The supported private channel. Use this. |
| GitHub private vulnerability reporting (**Security → Advisories → Report a vulnerability**) | **Not enabled** on `shep-ai/shep` today, so the button is absent. A maintainer can turn it on under *Settings → Code security*; if you see it, it is equally welcome. |
| Public GitHub issue | Never, for anything security-sensitive. |

## Response Timeline

- **Acknowledgment**: We will acknowledge your report within **48 hours**.
- **Triage**: We will assess the severity and impact within **7 days**.
- **Resolution**: We will work on a fix and coordinate disclosure with you. The timeline for a fix depends on the severity and complexity of the issue.

## What to Expect

1. You will receive an acknowledgment email confirming we received your report.
2. We will investigate and keep you informed of our progress.
3. Once a fix is ready, we will release a patch and credit you in the release notes (unless you prefer to remain anonymous).
4. We will coordinate public disclosure timing with you.

## Security Gates in CI

Three jobs in [`.github/workflows/ci.yml`](./.github/workflows/ci.yml) run on every push to `main`/`develop` and on every pull request against them. All three are listed as `needs:` for the **Release** job, so a failure blocks publishing.

| Job | What it does |
| --- | ------------ |
| **Gitleaks** (`security-gitleaks`) | Installs the gitleaks CLI (pinned to 8.30.1) and runs `gitleaks detect --source . --verbose --redact --config .gitleaks.toml --gitleaks-ignore-path .gitleaksignore` over the **full history** (`fetch-depth: 0`). Add a rule to [`.gitleaks.toml`](./.gitleaks.toml) or a fingerprint to [`.gitleaksignore`](./.gitleaksignore) for a verified false positive — never by deleting the finding. |
| **Semgrep** (`security-semgrep`) | SAST via `returntocorp/semgrep-action@v1` with the `p/typescript`, `p/javascript` and `p/security-audit` rule packs. Has `security-events: write` so results can surface in the Security tab. |
| **Security Enforce** (`security-enforce`) | Shep scanning itself: `pnpm dev:cli security enforce --output json`, which validates dependency risk, release integrity and governance posture. Gated by `SHEP_SUPPLY_CHAIN_SECURITY` (repository variable, default `true`, which opts in even though the `aspm` flag that owns supply-chain security is off on a fresh install); setting it to `false` makes the CLI exit 0 with a "flag disabled" note. |

A fourth job, **Security Summary** (`security-summary`), posts an aggregated comment on the PR — but only when Gitleaks or Semgrep actually failed.

If one of these fires on your branch, it is your finding to resolve. Do not disable a gate to get a PR green.

## Scope

This policy applies to the Shep CLI, web UI, and all packages published under the `@shepai` npm scope.

## Thank You

We appreciate your help in keeping Shep and its users safe. Responsible disclosure helps us address issues before they can be exploited.
