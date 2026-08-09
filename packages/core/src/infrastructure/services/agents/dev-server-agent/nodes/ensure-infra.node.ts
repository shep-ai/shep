/**
 * ensure_infra node — binary probes and user-space remediation.
 *
 * Derives the set of binaries a run plan actually needs (the package
 * manager plus the first real executable token of `command` and of each
 * `setupCommands` entry), probes them cross-platform, and — on a miss —
 * makes exactly ONE agent-executor remediation attempt restricted to
 * user-space, non-interactive installs before re-probing just the binaries
 * that were missing.
 *
 * Never throws: a missing run plan, an unremediable miss, and an executor
 * that throws during remediation are all expected outcomes surfaced as a
 * `failureReason` state update (never an unhandled rejection), so the graph
 * can route to its terminal failure edge instead of crashing.
 */
import { execFile, type ExecFileException } from 'node:child_process';
import { IS_WINDOWS } from '@/infrastructure/platform.js';
import type { IAgentExecutor } from '@/application/ports/output/agents/agent-executor.interface.js';
import type { DevServerRunPlan } from '@/domain/generated/output.js';
import type { DevServerAgentNodeFn } from '../types.js';

const PROBE_TIMEOUT_MS = 3_000;
const DEFAULT_REMEDIATION_TIMEOUT_MS = 120_000;

/** Binary names are restricted to this shape — anything else is rejected as unavailable to avoid shell injection. */
const VALID_BINARY_NAME = /^[A-Za-z0-9._+-]+$/;

/** Shell builtins/keywords that never resolve to a probeable binary on PATH. */
const SHELL_BUILTINS = new Set(['cd', 'sh', 'bash', 'env', 'exec', 'source', '.', 'export', 'set']);

const NO_RUN_PLAN_REASON = 'No run plan available for infrastructure check';

/**
 * Suggested install command per well-known binary; anything else falls back
 * to a generic PATH hint.
 *
 * Grouped by ecosystem, covering every runtime the detector registry can
 * emit a command for (FR-8). This is deliberately a DATA table rather than a
 * per-ecosystem required-binary table: `deriveBinaryFromCommand` already
 * derives what to probe from the command that will actually be spawned, so a
 * second keyed-by-detector source of truth could only ever disagree with it.
 *
 * Every hint is user-space and non-interactive — no `sudo`, no system
 * package manager — matching the constraint the remediation prompt puts on
 * the agent. A hint the user cannot run without root is not a hint.
 */
export const SUGGESTED_INSTALL: Record<string, string> = {
  // Node
  pnpm: 'npm install -g pnpm',
  yarn: 'npm install -g yarn',
  bun: 'npm install -g bun',
  node: 'install Node.js from https://nodejs.org',
  // Deno
  deno: 'npm install -g deno (or see https://docs.deno.com/runtime/getting_started/installation/)',
  // Task runner / containers
  make: 'install GNU Make — macOS: `xcode-select --install`, Windows: `winget install GnuWin32.Make`',
  docker: 'install Docker Desktop from https://docs.docker.com/get-docker/',
  // Go
  go: 'install Go from https://go.dev/dl/',
  // Rust
  cargo: 'install Rust with rustup from https://rustup.rs',
  rustup: 'install rustup from https://rustup.rs',
  // Python
  python: 'install Python from https://www.python.org/downloads/ (or `uv python install`)',
  python3: 'install Python from https://www.python.org/downloads/ (or `uv python install`)',
  uv: 'install uv from https://docs.astral.sh/uv/getting-started/installation/',
  poetry: 'pipx install poetry (see https://python-poetry.org/docs/#installation)',
  pipenv: 'pipx install pipenv',
  // Ruby
  ruby: 'install Ruby from https://www.ruby-lang.org/en/documentation/installation/',
  bundle: 'gem install bundler',
  // Elixir
  mix: 'install Elixir (which ships mix) from https://elixir-lang.org/install.html',
  elixir: 'install Elixir from https://elixir-lang.org/install.html',
};

function suggestedInstallCommand(binary: string): string {
  return SUGGESTED_INSTALL[binary] ?? `install '${binary}' and ensure it is on PATH`;
}

/**
 * Cross-platform, non-throwing availability probe for a single binary, with
 * a short bound so a hung shell can never stall the graph.
 *
 * win32: `where <binary>`. Everything else: `sh -c "command -v -- <binary>"`.
 * The binary name is validated against {@link VALID_BINARY_NAME} first —
 * anything else is treated as unavailable without ever reaching a shell.
 */
export function probeBinaryDefault(binary: string): Promise<boolean> {
  return new Promise((resolve) => {
    if (!VALID_BINARY_NAME.test(binary)) {
      resolve(false);
      return;
    }

    const callback = (error: ExecFileException | null): void => resolve(!error);

    try {
      if (IS_WINDOWS) {
        execFile('where', [binary], { timeout: PROBE_TIMEOUT_MS }, callback);
      } else {
        execFile('sh', ['-c', `command -v -- ${binary}`], { timeout: PROBE_TIMEOUT_MS }, callback);
      }
    } catch {
      resolve(false);
    }
  });
}

/**
 * Derive the required binary for one command string: skip leading
 * `KEY=value` env-assignment tokens, then reject the resulting token when
 * it's a shell builtin/keyword or a path (contains `/` or `\`). Returns
 * `undefined` when the command yields no probeable binary.
 */
function deriveBinaryFromCommand(command: string): string | undefined {
  const tokens = command.trim().split(/\s+/).filter(Boolean);
  let index = 0;
  while (index < tokens.length && tokens[index].includes('=')) {
    index += 1;
  }

  const token = tokens[index];
  if (!token) return undefined;
  if (SHELL_BUILTINS.has(token)) return undefined;
  if (token.includes('/') || token.includes('\\')) return undefined;
  return token;
}

/**
 * Unique, order-stable list of binaries a run plan requires: the package
 * manager (when set), then `command`'s derived binary, then each
 * `setupCommands` entry's derived binary — each added only once.
 */
function deriveRequiredBinaries(plan: DevServerRunPlan): string[] {
  const binaries: string[] = [];
  const add = (binary: string | undefined): void => {
    if (binary && !binaries.includes(binary)) {
      binaries.push(binary);
    }
  };

  add(plan.packageManager);
  add(deriveBinaryFromCommand(plan.command));
  for (const setupCommand of plan.setupCommands) {
    add(deriveBinaryFromCommand(setupCommand));
  }

  return binaries;
}

/** Probe every binary in order, returning the subset that is NOT available. */
async function probeMissing(
  binaries: string[],
  probeBinary: (binary: string) => Promise<boolean>
): Promise<string[]> {
  const missing: string[] = [];
  for (const binary of binaries) {
    // Sequential is fine — this runs once per graph pass, not in a hot loop.
    const present = await probeBinary(binary);
    if (!present) {
      missing.push(binary);
    }
  }
  return missing;
}

/**
 * Pure prompt builder for the one-shot remediation attempt: instructs the
 * agent to install exactly the missing binaries using user-space,
 * non-interactive commands only, and to verify + report what it did.
 */
export function buildInfraRemediationPrompt(missing: string[], platform: string): string {
  return [
    `The following required command-line tools are missing on this ${platform} machine: ${missing.join(', ')}.`,
    '',
    'Install ONLY these missing tools, using USER-SPACE, NON-INTERACTIVE commands only:',
    '- Prefer `corepack enable` for pnpm/yarn, or `npm install -g <package>` under the user prefix.',
    '- Official installers are acceptable ONLY when run with their non-interactive flag (e.g. `-y`, `--yes`).',
    '- NEVER use `sudo` and NEVER use a system package manager (apt, yum, dnf, brew --system, etc.).',
    '',
    'After installing, verify each tool with `<tool> --version` and report exactly what was done for each one.',
  ].join('\n');
}

/** Dependencies for the ensure_infra node. */
export interface EnsureInfraNodeDeps {
  /** null means no remediation is possible (deterministic-only degradation). */
  executor: IAgentExecutor | null;
  /** Availability probe; defaults to {@link probeBinaryDefault}. */
  probeBinary?: (binary: string) => Promise<boolean>;
  log: (line: string) => void;
  /** Bound for the single remediation execution. Defaults to 120s. */
  remediationTimeoutMs?: number;
}

export const createEnsureInfraNode = (deps: EnsureInfraNodeDeps): DevServerAgentNodeFn => {
  const probeBinary = deps.probeBinary ?? probeBinaryDefault;
  const remediationTimeoutMs = deps.remediationTimeoutMs ?? DEFAULT_REMEDIATION_TIMEOUT_MS;

  return async (state) => {
    const { runPlan } = state;

    if (runPlan === null) {
      return {
        failureReason: NO_RUN_PLAN_REASON,
        capturedLogs: [NO_RUN_PLAN_REASON],
      };
    }

    const required = deriveRequiredBinaries(runPlan);
    let missing = await probeMissing(required, probeBinary);

    if (missing.length === 0) {
      return {
        infraReady: true,
        capturedLogs: [
          `ensure_infra: all required binaries present${required.length > 0 ? ` (${required.join(', ')})` : ''}`,
        ],
      };
    }

    const logs: string[] = [`ensure_infra: missing required binaries: ${missing.join(', ')}`];

    if (deps.executor) {
      deps.log(`ensure_infra: attempting remediation for ${missing.join(', ')}`);

      const prompt = buildInfraRemediationPrompt(missing, process.platform);
      try {
        await deps.executor.execute(prompt, {
          cwd: state.targetPath,
          timeout: remediationTimeoutMs,
          silent: true,
        });
      } catch (err) {
        // An executor failure just means remediation didn't happen — the
        // re-probe below confirms the binaries are still missing.
        logs.push(`ensure_infra: remediation attempt threw: ${(err as Error).message}`);
      }

      missing = await probeMissing(missing, probeBinary);

      if (missing.length === 0) {
        logs.push('ensure_infra: remediation succeeded — all binaries now present');
        return { infraReady: true, capturedLogs: logs };
      }

      logs.push(`ensure_infra: remediation attempted but still missing: ${missing.join(', ')}`);
    }

    const failureReason = missing
      .map((binary) => `'${binary}' is missing (install with: ${suggestedInstallCommand(binary)})`)
      .join('; ');

    return {
      failureReason,
      capturedLogs: logs,
      ...(deps.executor ? {} : { degraded: true }),
    };
  };
};
