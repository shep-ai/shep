# Adding a New Agent Type (Provider)

Guide to teaching Shep about a new AI coding agent — a new `AgentType` such as `kimi-code`,
with its own executor, installer entry and UI presence.

> **Scope**
>
> This guide is about adding an agent **provider**. For adding a new phase to the feature-agent
> LangGraph pipeline, see [adding-agent-nodes.md](./adding-agent-nodes.md).
>
> The worked example throughout is **Kimi Code** (Moonshot AI, binary `kimi`,
> `AgentType.KimiCode = 'kimi-code'`), which is fully landed in the tree — every file quoted below
> can be opened and read.

---

## Start here: the compiler writes your to-do list

`packages/core/src/domain/shared/agent-catalog.ts` holds one row per agent type, and it is typed
as a **total** record:

```typescript
export const AGENT_CATALOG: Record<AgentType, AgentDescriptor> = {
  /* ... */
};
```

`Record<AgentType, …>` means every member of the generated `AgentType` enum must have a row. So the
moment you add the enum member in TypeSpec and regenerate, **the build breaks** until you fill in
the descriptor. The module's own header explains why that is the design:

```
 * Before this existed, the same facts were restated in a dozen hand-maintained
 * tables (the executor factory's five lists, the validator's binary map, the
 * auth use case's metadata table, the model catalog, the TUI choices, and three
 * separate web tables). Nothing related them, so they drifted: `codex-cli` and
 * `llmproxy` were missing from the auth table and reported as "Unknown", the
 * Cursor binary was recorded as `cursor` in two places and `cursor-agent` in
 * two others, and two tool ids never matched a real tool file.
 *
 * The catalog is typed as a total `Record<AgentType, AgentDescriptor>`, so
 * adding a member to the TypeSpec `AgentType` enum is a COMPILE ERROR until its
 * facts are filled in here. That is the point: the compiler now produces the
 * "what do I have to touch" list that used to be tribal knowledge.
```

Practical consequence: **do step 1, run `pnpm typecheck`, and let the error tell you to do step 2.**
Everything downstream that reads the catalog — the executor factory's supported list, the CLI
availability diagnostic, the auth check, the model lists, the TUI picker — then lights up for free.

The ten steps below are the remaining work the compiler cannot do for you.

---

## Step 1 — Declare the enum member in TypeSpec

**File:** `tsp/common/enums/agent-config.tsp`

Domain types are authored in TypeSpec and generated into TypeScript; never hand-edit
`packages/core/src/domain/generated/output.ts`.

```tsp
enum AgentType {
  /**
   * Anthropic's Claude Code CLI tool.
   * Supported — uses the `claude` binary for CLI execution.
   */
  @doc("Claude Code CLI by Anthropic")
  ClaudeCode: "claude-code",

  /**
   * Moonshot AI's Kimi Code CLI terminal agent.
   * Supported — uses the `kimi` binary in print mode (`--print`) with
   * newline-delimited JSON output for non-interactive execution against
   * Kimi K-series models.
   */
  @doc("Kimi Code CLI by Moonshot AI")
  KimiCode: "kimi-code",
  // ...
}
```

Also update the module-level doc comment at the top of the file, which lists the supported agents
and the `← Currently supported` / `← Coming Soon` table.

Then regenerate:

```bash
pnpm generate        # = pnpm tsp:codegen = tsp compile tsp/ --emit … && prettier --write <generated>
```

The result lands in `packages/core/src/domain/generated/output.ts`:

```typescript
export enum AgentType {
  ClaudeCode = 'claude-code',
  KimiCode = 'kimi-code',
  CodexCli = 'codex-cli',
  // ...
}
```

The generated file **is committed**. CI re-runs `pnpm generate` and fails if the committed output
differs, and the `pre-commit` hook regenerates and stages it for you.

Run `pnpm typecheck` now. It will fail on `AGENT_CATALOG` — that is step 2.

## Step 2 — Fill in the catalog row

**File:** `packages/core/src/domain/shared/agent-catalog.ts`

The Kimi row in full:

```typescript
  [AgentType.KimiCode]: {
    type: AgentType.KimiCode,
    label: 'Kimi Code',
    description: "Moonshot AI's Kimi Code CLI terminal agent (Kimi K-series models)",
    kind: 'cli',
    supported: true,
    binary: 'kimi',
    versionArgs: VERSION_FLAG,
    toolId: 'kimi',
    models: KIMI_CODE_MODELS,
    order: 1,
    requiresToken: false,
    docsUrl: 'https://moonshotai.github.io/kimi-cli/en/',
    i18nKey: 'kimiCode',
  },
```

Field by field:

| Field          | Meaning                                                                                              |
| -------------- | ---------------------------------------------------------------------------------------------------- |
| `type`         | The enum value, repeated so a descriptor is self-describing once detached from the map                |
| `label`        | Human-readable name shown in CLI, TUI and web                                                         |
| `description`  | One-line description for pickers                                                                      |
| `kind`         | `'cli'` (binary on PATH, driven as a subprocess), `'sdk'` (HTTP API via the Vercel AI SDK), `'mock'`  |
| `supported`    | `false` for agents listed for future extensibility — shown as "Coming Soon", never handed to the factory |
| `binary`       | Binary name on PATH, or `null` for SDK and mock agents                                                |
| `versionArgs`  | Arguments that make the binary print its version (`VERSION_FLAG` = `['--version']`; Cline uses `['version']`) |
| `toolId`       | Id in the tool-installer catalogue, or `null` when Shep cannot install it                             |
| `models`       | Static model identifiers offered for this agent                                                       |
| `order`        | Sort weight in pickers — lower first, demo last (`dev` is 90, Coming Soon entries are 100+)           |
| `requiresToken`| Whether an API token is required, as opposed to the agent's own session                               |
| `docsUrl`      | Where a user learns to install or authenticate this agent                                             |
| `i18nKey`      | Key under `tui:prompts.selectAgent.choices` for the translated name and description                   |

Three traps the header comment records, because each one shipped as a bug:

1. **`toolId` MUST equal the basename of the JSON file** under
   `packages/core/src/infrastructure/services/tool-installer/tools/`. Kimi's is `kimi` because the
   file is `kimi.json`. Copilot's is `copilot`, **not** `copilot-cli`. A `toolId` that names no file
   makes the agent report as "not installed" forever — silently. A unit test now enforces this (step 9).
2. **`binary` is the CLI binary, not the product.** Cursor's is `cursor-agent`; `cursor` is the
   desktop editor. The catalog carries a comment saying so, and a regression test pins it.
3. **`i18nKey` is held explicitly, not derived from the type**, because the existing keys are
   irregular (`openRouter`, `devMock`, `llmProxy`) and renaming them would invalidate nine locale files.

Model lists are declared as module constants above the catalog, with a sourced comment:

```typescript
/**
 * Moonshot AI Kimi models.
 *
 * `--model` selects a model *configuration key* from `~/.kimi/config.toml`;
 * the shipped defaults use the API identifiers below. The `kimi-k2` series and
 * `kimi-k2.5` were discontinued in 2026 and are deliberately absent.
 * Source: https://platform.kimi.ai/docs/models (retrieved 2026-09-20).
 */
const KIMI_CODE_MODELS = [
  'kimi-k3',
  'kimi-k2.7-code',
  'kimi-k2.7-code-highspeed',
  'kimi-k2.6',
  'kimi-for-coding',
] as const;
```

Do **not** add the model list to `agents/common/agent-model-catalog.ts` — that module is now just a
re-export view over the catalog, and its own header says "To add or retire a model, edit the
catalog — not this file."

### What you get for free once the row exists

These read the catalog and need no edit at all:

| File                                                                                  | What it derives                                            |
| ------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| `infrastructure/services/agents/common/agent-executor-factory.service.ts`             | `EXECUTABLE_AGENT_TYPES`, `getSupportedAgents()`, `getCliInfo()` |
| `infrastructure/services/agents/common/agent-validator.service.ts`                    | binary/kind-based availability checks                       |
| `infrastructure/services/agents/common/agent-model-catalog.ts`                        | per-agent model constants                                   |
| `application/use-cases/agents/check-agent-auth.use-case.ts`                            | label, binary name, tool id for the auth report             |
| `application/use-cases/doctor/diagnostics/agent-cli-availability.diagnostic.ts`        | `AGENT_PROBES` for `shep doctor`                            |
| `src/presentation/tui/prompts/agent-select.prompt.ts`                                  | the whole picker list                                       |

## Step 3 — Write the executor

**Directory:** `packages/core/src/infrastructure/services/agents/common/executors/`
**Contract:** `packages/core/src/application/ports/output/agents/agent-executor.interface.ts`

```typescript
export interface IAgentExecutor {
  readonly agentType: AgentType;
  execute(prompt: string, options?: AgentExecutionOptions): Promise<AgentExecutionResult>;
  executeStream(
    prompt: string,
    options?: AgentExecutionOptions
  ): AsyncIterable<AgentExecutionStreamEvent>;
  supportsFeature(feature: AgentFeature): boolean;
}
```

Pick your base by `kind`:

- **`kind: 'sdk'`** — extend `executors/ai-sdk-base-executor.service.ts`. That abstract class
  already implements `execute`, `executeStream`, `generateObject`, timeout handling, truncation
  detection and token-usage extraction over the Vercel AI SDK; a subclass only implements
  `createModel()` and sets `agentType`. `openrouter-`, `together-ai-`, `ollama-` and
  `llmproxy-executor.service.ts` are the four subclasses.
- **`kind: 'cli'`** — write a class that spawns the binary, like
  `executors/kimi-code-executor.service.ts`.

### The CLI executor pattern, from `kimi-code-executor.service.ts`

**Inject the spawn function** — never import `node:child_process` directly, so tests need no module
mocking:

```typescript
export class KimiCodeExecutorService implements IAgentExecutor {
  readonly agentType: AgentType = 'kimi-code' as AgentType;

  constructor(
    private readonly spawn: SpawnFunction,
    private readonly authConfig?: AgentConfig
  ) {}
```

**Claim only the features you actually implement:**

```typescript
/**
 * `--session <id>` both creates and resumes, so session resume is real.
 * Structured output, tool scoping and session listing have no CLI equivalent
 * and are deliberately not claimed — an executor that over-claims a feature
 * makes callers silently pass options that are dropped.
 */
const SUPPORTED_FEATURES = new Set<string>(['session-resume', 'streaming']);
```

**Keep secrets and prompts out of argv.** The prompt is piped via stdin; the API key is passed
through the environment and the CLI is *told which variable to read*:

```typescript
if (this.authConfig?.authMethod === AgentAuthMethod.Token && this.authConfig.token) {
  args.push(
    '--config',
    JSON.stringify({
      providers: { [KIMI_PROVIDER_NAME]: { api_key_env: KIMI_API_KEY_ENV } },
    })
  );
}
```

**Validate security constraints before launching** — `validateSecurityConstraints(...)` from
`executors/security-constraint-validator.ts`, with a `CAPABILITIES` record stating whether the
executor needs permissive mode (Kimi does, because `--afk` auto-approves tool calls).

**Map exit codes honestly.** Kimi distinguishes `1` (permanent) from `75` (transient — rate limit,
5xx, timeout), and the executor rejects with different messages so a retry layer can tell them apart.

### Reuse the process helpers — do not hand-roll them

**File:** `packages/core/src/infrastructure/services/agents/common/executors/process-stream.ts`

Its header names the three defects that got reintroduced every time the chunk-to-line loop was
copied:

```
 *  1. A JSON object split across two stdout chunks is dropped or throws.
 *  2. A `Buffer.toString()` per chunk splits a multi-byte UTF-8 character that
 *     straddles the chunk boundary, corrupting the line.
 *  3. An agent that streams megabytes without ever emitting a newline grows the
 *     buffer without bound.
```

`createLineAccumulator(onLine, options?)` solves all three once:

- routes every chunk through a `StringDecoder`, so a multi-byte character split across two buffers
  is reassembled instead of becoming `U+FFFD`;
- emits one trimmed, non-blank line per `\n`, normalising `\r\n` so Windows agents parse identically;
- bounds a single un-terminated line at `DEFAULT_MAX_LINE_BYTES` (32 MiB), discarding the rest of an
  over-long line and reporting the dropped byte count through `onOverflow`;
- `flush()` emits a trailing line that arrived without a newline, and is idempotent.

Usage:

```typescript
const accumulator = createLineAccumulator(
  (line) => {
    const message = this.parseMessage(line);
    // ...
  },
  {
    onOverflow: (dropped) =>
      this.log(`[warn] discarded ${dropped} bytes of un-terminated agent output`),
  }
);

proc.stdout?.on('data', (chunk: Buffer | string) => accumulator.push(chunk));
proc.on('close', () => {
  accumulator.flush();
  // ...
});
```

The module also exports the shared limits `DEFAULT_MAX_STDERR_CHARS` (only the tail of stderr is
ever read — it becomes the failure message — so an agent writing progress bars for an hour must not
grow the worker's heap) and `SIGKILL_GRACE_MS`. Import those rather than re-declaring them —
`kimi-code-executor.service.ts` still carries a local copy of the grace period, which is exactly the
duplication the shared module exists to end.

`killProcessTree(proc, options?)` terminates the agent and, on Windows, its whole tree via
`taskkill /F /T` — because `ChildProcess.kill()` signals only the direct child, and agent CLIs on
Windows are launched through a shell wrapper, so a timeout used to orphan the real agent. It never
throws; an already-exited process is the expected case.

Kimi's timeout path shows the full pattern — kill the tree, then escalate to `SIGKILL` after a
grace period, and reject immediately rather than waiting for a `close` event a wedged child may
never emit:

```typescript
timeoutId = setTimeout(() => {
  this.log(`Timeout after ${options.timeout}ms — terminating agent`);
  killProcessTree(proc);
  sigkillId = setTimeout(() => {
    try {
      proc.kill('SIGKILL');
    } catch {
      /* already gone */
    }
  }, SIGKILL_GRACE_MS);
  sigkillId.unref?.();
  settle(() => reject(new Error('Agent execution timed out')));
}, options.timeout);
```

## Step 4 — Add the factory case

**File:** `packages/core/src/infrastructure/services/agents/common/agent-executor-factory.service.ts`

`createExecutor` switches on the agent type string, caches one instance per type, and throws for
anything unrecognised:

```typescript
  createExecutor(agentType: AgentType, _authConfig: AgentConfig): IAgentExecutor {
    const key = agentType as string;
    const cached = this.cache.get(key);
    if (cached) return cached;

    let executor: IAgentExecutor;
    switch (key) {
      case 'claude-code':
        executor = new ClaudeCodeExecutorService(this.spawn);
        break;
      // ...
      case 'kimi-code':
        executor = new KimiCodeExecutorService(this.spawn, _authConfig);
        break;
      // ...
      default:
        throw new Error(
          `Unsupported agent type: ${agentType}. Supported: ${this.getSupportedAgents().join(', ')}`
        );
    }

    this.cache.set(key, executor);
    return executor;
  }
```

Pass `_authConfig` when your executor needs credentials (Kimi, Codex, Copilot, Gemini do; Claude
Code and Cursor do not). SDK executors take the token directly
(`new OpenRouterExecutorService(_authConfig.token ?? '')`); Ollama and LLMProxy pass it through
`resolveLocalProviderBaseUrl`, which accepts only an http(s) URL and refuses the `169.254.0.0/16`
cloud-metadata range — a token pasted into that field would otherwise be used as a URL and receive
the whole prompt.

The *lists* around the switch are already derived from the catalog, so you do not touch them:

```typescript
const EXECUTABLE_AGENT_TYPES: ReadonlySet<string> = new Set(
  listAgentDescriptors()
    .filter((descriptor) => descriptor.supported)
    .map((descriptor) => descriptor.type as string)
);
```

That set and `getSupportedAgents()` used to be hand-listed and could disagree with the switch —
"the mismatch was invisible until a user picked an agent that threw at run time". Marking an agent
`supported: true` in the catalog without adding the switch case reintroduces exactly that, so do
both in the same change.

`createInteractiveExecutor` / `supportsInteractive` are separate: both read the factory's
`INTERACTIVE_EXECUTORS` table, which currently holds `claude-code` and `cursor`. Add an entry only
when you are implementing a real interactive session — one agent process for the whole chat, not a
process per message. If the agent's CLI serves the Agent Client Protocol, write an `AcpAgentProfile`
and reuse `AcpInteractiveExecutor` (see `cursor-interactive-executor.service.ts`) instead of a new
executor.

## Step 5 — Add the tool-installer entry

**File:** `packages/core/src/infrastructure/services/tool-installer/tools/<toolId>.json`

The filename minus `.json` **is** the tool id — `tool-metadata.ts` loads the directory dynamically.
`kimi.json`:

```json
{
  "name": "Kimi Code CLI",
  "summary": "Terminal coding agent from Moonshot AI",
  "description": "Kimi Code CLI is Moonshot AI's terminal coding agent. It reads and edits code, runs shell commands, searches the web, and plans autonomously, backed by the Kimi K-series models.",
  "tags": ["cli-agent"],
  "author": "Moonshot AI",
  "website": "https://www.kimi.com/code",
  "platforms": ["linux", "darwin", "win32"],
  "iconUrl": "https://cdn.simpleicons.org/kimi",
  "binary": "kimi",
  "packageManager": "curl",
  "commands": {
    "linux": "curl -fsSL https://code.kimi.com/install.sh | bash",
    "darwin": "curl -fsSL https://code.kimi.com/install.sh | bash",
    "win32": "powershell -Command \"irm https://code.kimi.com/install.ps1 | iex\""
  },
  "timeout": 300000,
  "documentationUrl": "https://moonshotai.github.io/kimi-cli/en/",
  "verifyCommand": "kimi --version",
  "autoInstall": true,
  "openDirectory": "cd {dir} && exec kimi",
  "spawnOptions": { "shell": true, "stdio": "inherit", "detached": false },
  "terminalCommand": {
    "linux": "x-terminal-emulator -e bash -c 'cd {dir} && exec kimi'",
    "darwin": "open -a Terminal.app bash -c 'cd {dir} && exec kimi'",
    "win32": "start pwsh.exe 'cd {dir} && kimi'"
  }
}
```

The full field table lives in `tools/CLAUDE.md`, alongside its own "Adding a New Tool" checklist
(validate the icon URL returns 200; `autoInstall: false` for manual-download tools). Two rules that
matter for agent CLIs specifically:

- **`spawnOptions` must be `{ shell: true, stdio: "inherit", detached: false }`.** The GUI defaults
  (`detached: true, stdio: "ignore"`) are fire-and-forget and wrong for a terminal agent.
- **`terminalCommand` is required for web launches**, which have no TTY to inherit. The launcher
  auto-detects: CLI launch uses `openDirectory`, web launch uses `terminalCommand`.

Tag it `cli-agent` so it appears in the right filter tab.

## Step 6 — Add resume support (CLI agents with sessions)

**File:** `packages/core/src/domain/shared/agent-resume-descriptor.ts`

```typescript
const RESUME_BINARIES: Partial<Record<AgentType, string>> = {
  [AgentType.ClaudeCode]: 'claude',
  [AgentType.CodexCli]: 'codex',
  [AgentType.Cursor]: 'cursor-agent',
  // Kimi's `--resume <id>` is an alias of `--session <id>`, which both creates
  // and reopens a session.
  [AgentType.KimiCode]: 'kimi',
};
```

This map is `Partial`, so it is not a compile error to omit an agent — `buildAgentResumeDescriptor`
returns `null` for an unknown type "rather than guessing", and `supportsSessionResume()` reports
false. Add your agent only if its CLI really supports `--resume <id>`.

The file's header records two invariants, both from shipped bugs:

1. **No `--project` flag.** The web UI used to offer `claude --resume <id> --project <path>`, which
   fails when pasted — no supported agent accepts it. The working directory carries the project,
   which is why `cwd` is part of the descriptor.
2. **argv, never a shell string.** Session ids come from filenames on disk, so the descriptor stays
   a binary plus an argument array and nothing downstream interpolates it into a shell.

Session ids are additionally validated against `SAFE_SESSION_ID = /^[A-Za-z0-9._-]+$/` and rejected
rather than escaped. `clipboardCommand` single-quotes the cwd with the POSIX `'\''` idiom.

## Step 7 — Add TUI translations (all nine locales)

**Files:** `translations/<locale>/tui.json` for **ar, de, en, es, fr, he, pt, ru, uk**

The key path is `tui:prompts.selectAgent.choices.<i18nKey>`, built in
`src/presentation/tui/prompts/agent-select.prompt.ts`:

```typescript
const choiceKey = (key: string, field: string) => `tui:prompts.selectAgent.choices.${key}.${field}`;
```

So for Kimi (`i18nKey: 'kimiCode'`), each locale's `tui.json` gains:

```json
"kimiCode": {
  "name": "Kimi Code",
  "description": "Moonshot AI's Kimi Code CLI terminal agent (Kimi K-series models)"
}
```

Unsupported ("Coming Soon") agents carry `name` + `disabled` instead of `name` + `description` —
see the `aider` entry.

**The picker itself is generated from the catalog.** You add translations, not picker entries:

```typescript
/**
 * The list is derived from the domain agent catalog rather than hand-written,
 * so a newly supported agent appears here automatically. The previous
 * hand-maintained list had silently omitted `llmproxy`, leaving a fully
 * supported agent unreachable from `shep settings`.
 */
export function createAgentSelectConfig() {
  // ...
  choices: listAgentDescriptors().map((descriptor) => {
    const name = t(nameKey, { defaultValue: descriptor.label });
    // ...
  }),
}
```

Every lookup passes a `defaultValue` from the descriptor, so a locale that has not caught up falls
back to the catalog text rather than hiding a working agent. That is a safety net, not a licence to
skip locales: `tests/unit/translations/translation-completeness.test.ts` asserts exact key parity
with `en` for every locale and namespace, so a missing `kimiCode` in `ru/tui.json` fails the suite.

## Step 8 — Update the web surfaces

**Status as of this writing: the web app is *not* catalog-driven yet.** Unlike the TUI, these
files still hold hand-maintained agent tables, and they are the drift the catalog exists to kill —
check them, and prefer replacing the table with `listAgentDescriptors()` over adding one more row:

| File                                                                          | Hand-maintained table                                         |
| ----------------------------------------------------------------------------- | ------------------------------------------------------------- |
| `src/presentation/web/components/features/settings/agent-settings-section.tsx` | `AGENT_TYPE_OPTIONS`, `SESSION_ONLY_AGENTS`, `TOKEN_REQUIRED_AGENTS` |
| `src/presentation/web/components/features/settings/settings-page-client.tsx`   | `SESSION_ONLY_AGENTS`, `TOKEN_REQUIRED_AGENTS`                 |
| `src/presentation/web/app/actions/get-all-agent-models.ts`                     | `AGENT_LABELS`, `AGENT_ORDER`                                  |
| `src/presentation/web/components/common/feature-node/agent-type-icons.tsx`     | the `AgentIconType` union, the brand-icon map and the label map |

`AGENT_LABELS`/`AGENT_ORDER` duplicate the catalog's `label` and `order`; `TOKEN_REQUIRED_AGENTS`
duplicates `requiresToken`. The Storybook mock at
`.storybook/mocks/app/actions/get-all-agent-models.ts` already imports `listAgentDescriptors()`,
which is the shape the real action should take.

Icons are the one thing the catalog genuinely does not carry — a new agent needs an SVG under
`src/presentation/web/public/icons/agents/` plus its entry in `agent-type-icons.tsx`, and
`getAgentTypeIcon()` falls back to a generic icon until you add it. Remember the repo's
**mandatory Storybook rule**: every web component change needs its colocated `.stories.tsx` kept in
sync (`agent-type-icons.stories.tsx` here).

The model list itself needs no web change — `getAllAgentModels()` calls
`factory.getSupportedAgents()` and `factory.listAvailableModels()`, both catalog-derived.

## Step 9 — Tests

**Executor tests:** `tests/unit/infrastructure/services/agents/executors/<agent>-executor.test.ts`.
Mirror `kimi-code-executor.test.ts`, which is the most complete example. It uses a
constructor-injected spawn mock — **not** `vi.mock('node:child_process')` — and covers:

```
agentType · supportsFeature (including what it must NOT claim)
command construction (print mode, auto-approve, prompt via stdin not argv, cwd,
  model, maxTurns, session id, CLAUDECODE stripped)
token authentication (key via env not argv; env var named to the CLI; no creds on session auth)
security constraints (refuse enforced strict sandbox; run under advisory strict)
result parsing (accumulate assistant text; ignore tool messages; JSON split across
  chunk boundaries; array-shaped content; non-JSON fallback; trailing line without newline)
failure handling (stderr on permanent exit; exit 75 as transient; actionable ENOENT
  message; kill + reject on timeout)
executeStream (progress events, tool-call announcements, error events)
```

The "JSON object split across a stdout chunk boundary" and "trailing line without a newline" cases
are the ones that catch a hand-rolled line reader. Keep them.

**Catalog tests:** `tests/unit/domain/shared/agent-catalog.test.ts` — and yes, **totality and
tool-id correspondence are both asserted**:

```typescript
  it('should describe every member of the AgentType enum', () => {
    const described = Object.keys(AGENT_CATALOG).sort();
    const declared = Object.values(AgentType).sort();
    expect(described).toEqual(declared);
  });
```

```typescript
  // Tool ids are derived from the JSON filename, so a toolId that names no
  // file silently reports the agent as "not installed" forever. Two entries
  // were wrong this way before the catalog existed.
  it('should reference only tool ids that exist in the tool catalogue', () => {
    const toolIds = readdirSync(TOOLS_DIR)
      .filter((f) => f.endsWith('.json'))
      .map((f) => f.replace(/\.json$/, ''));

    for (const descriptor of listAgentDescriptors()) {
      if (descriptor.toolId === null) continue;
      expect(toolIds, `${descriptor.type} toolId`).toContain(descriptor.toolId);
    }
  });
```

Plus per-kind invariants (supported CLI agents have a binary and version args; SDK/mock agents have
none; every non-mock supported agent has at least one model, with no duplicates), distinct sort
orders, and a `describe('Kimi Code')` block pinning the binary and the current model list. Add an
equivalent block for your agent, especially if its model list has retired identifiers to exclude.

**Factory tests:** `tests/unit/infrastructure/services/agents/agent-executor-factory.test.ts`
asserts the supported list contains your type and has the same length as `listSupportedAgentTypes()`.

**Resume tests:** `tests/unit/domain/shared/agent-resume-descriptor.test.ts`.

**Translation tests:** `tests/unit/translations/translation-completeness.test.ts` (key parity across
all nine locales, no empty values, `{{variable}}` preservation).

Run them:

```bash
pnpm test:unit -t "Kimi"     # vitest filters by test NAME with -t; there is no --grep
pnpm test:unit
pnpm typecheck
```

## Step 10 — Update the docs

| Doc                                    | What to update                                                 |
| -------------------------------------- | --------------------------------------------------------------- |
| `README.md`                            | the agent list in the intro paragraph and the supported-agent table |
| `docs/guides/getting-started.md`       | the prerequisites / supported-agent table (agent, kind, binary) |
| `docs/guides/configuration.md`         | the `agent.type` value table                                    |
| `docs/architecture/agent-system.md`    | executor list, if the new agent introduces a new pattern        |
| `AGENTS.md`                            | only if the agent changes how resolution works                  |
| this guide                             | if a step changes, or a new trap is discovered                  |

Keep the binary column honest — it is the CLI binary (`cursor-agent`, not `cursor`).

---

## Checklist

- [ ] Enum member added to `tsp/common/enums/agent-config.tsp` with a doc comment, and the module
      header's supported-agent list updated
- [ ] `pnpm generate` run; `packages/core/src/domain/generated/output.ts` regenerated and committed
      (never hand-edited)
- [ ] `AGENT_CATALOG` row added in `packages/core/src/domain/shared/agent-catalog.ts`, with a model
      list constant carrying a sourced comment
- [ ] `toolId` equals the basename of the tool JSON file; `binary` is the CLI binary
- [ ] Executor added under `agents/common/executors/` implementing `IAgentExecutor`, with the spawn
      function injected (CLI) or extending `AiSdkBaseExecutorService` (SDK)
- [ ] `createLineAccumulator()` and `killProcessTree()` used — no hand-rolled chunk-to-line loop
- [ ] `supportsFeature` claims only what is implemented
- [ ] Secrets never in argv; prompt piped via stdin
- [ ] Switch case added in `agent-executor-factory.service.ts`
- [ ] `tool-installer/tools/<toolId>.json` added with `cli-agent` tag, `spawnOptions` and
      `terminalCommand`; icon URL verified to return 200
- [ ] `RESUME_BINARIES` updated if the CLI supports `--resume <id>`
- [ ] All **nine** locales updated at `tui:prompts.selectAgent.choices.<i18nKey>`
- [ ] Web settings tables updated (or, better, replaced with `listAgentDescriptors()`), with
      Storybook stories kept in sync
- [ ] Executor unit tests written first, mirroring `kimi-code-executor.test.ts`
- [ ] Catalog test block added for the new agent
- [ ] `pnpm test:unit`, `pnpm typecheck` and `pnpm lint` green
- [ ] Docs tables updated (README, getting-started, configuration)

---

## Maintaining This Document

**Update when:**

- `AgentDescriptor` gains or loses a field
- The executor factory or the `IAgentExecutor` contract changes
- The web surfaces become catalog-driven (step 8 then shrinks to "nothing to do")
- A new provider reveals a trap worth recording

**Related docs:**

- [adding-agent-nodes.md](./adding-agent-nodes.md) — adding a LangGraph node to the feature agent
- [AGENTS.md](../../AGENTS.md) — agent reference and resolution rules
- [agent-system.md](../architecture/agent-system.md) — agent architecture
- [typespec-guide.md](./typespec-guide.md) — TypeSpec workflow and code generation
- [tdd-guide.md](./tdd-guide.md) — TDD workflow
