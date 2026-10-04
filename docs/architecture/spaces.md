# Spaces and product lines

Spec: [`specs/120-spaces-and-product-lines`](../../specs/120-spaces-and-product-lines/).
User guide: [`docs/guides/spaces.md`](../guides/spaces.md).

Spaces partition project memory so a lesson learned in one body of work (a client,
an employer, personal projects) can never reach another. Product lines group
repositories inside a space for narrower sharing.

## Model

Authored in `tsp/domain/entities/space.tsp`:

| Entity                      | Purpose                                                       |
| --------------------------- | ------------------------------------------------------------- |
| `Space`                     | The wall. Exactly one is `isDefault`.                         |
| `ProductLine`               | A group of repositories inside one space.                     |
| `SpaceRule`                 | `Path` prefix or `Remote` pattern that places repositories.   |
| `RepositorySpaceAssignment` | An explicit pin of one repository path, overriding all rules. |

`ProjectMemory` carries `spaceId` and `productLineId`, stamped from the repository's
resolved space when an entry is first written. `MemoryScope` is `Project`,
`ProductLine` or `Space`; the pre-spaces `Organization` value is read as `Space`
within the entry's own `spaceId`.

Storage is one SQLite database (migration `152-create-spaces`), not one Shep home per
space: the connection, settings and DI container are process-wide singletons, so a
per-space home would mean a process per space. Credential isolation per space is
spec 121.

## Resolution

`domain/shared/space-resolution.ts` is pure and exhaustively unit-tested. For a
repository path (and its remote, when registered):

1. an assignment wins outright;
2. otherwise the matching rule with the highest specificity wins. Path rules score
   per matching segment; remote patterns score literal segments above wildcards
   (`*` stays within a segment, `**` spans segments). Ties go to the lower
   priority, then the lower rule id;
3. otherwise the default space.

Paths are compared case-insensitively for Windows drive and UNC paths and exactly
on POSIX; remotes are normalised to `host/owner/repo`.

`ResolveSpaceContextUseCase` loads spaces, lines, rules, assignments and registered
repositories once and resolves any number of paths (`executeMany`). It returns the
`Space`, the `ProductLine` (dropped if it belongs to another space) and the matched
`SpaceRule`.

## Memory reads

`loadCandidateMemory` (used by `ReadProjectMemoryUseCase` and
`SelectProjectMemoryUseCase`) unions three filtered queries:

- `listByRepository(path)` — the repository's own `Project` entries;
- `listProductLine(lineId)` — `ProductLine` entries of the repository's line;
- `listSpaceWide(spaceId)` — `Space` and legacy `Organization` entries of its space.

No query reads across spaces, so isolation does not depend on post-filtering.
`tests/integration/application/use-cases/spaces/space-memory-isolation.test.ts`
proves it through the real container and SQLite.

Interactive sessions resolve memory by the feature's repository path, never the
worktree path: worktrees live under `~/.shep/repos/<hash>/wt/`, which would resolve
into the default space.

## Agent settings (spec 121)

`Space.agentSettings` (`SpaceAgentSettings`: Claude and gh config directories, git author,
Bedrock, AWS profile, allowed agent types) becomes an environment change in
`domain/shared/space-environment.ts`: `spaceEnvironment()` returns `{ set, unset }`, where
`unset` lists host credentials that would otherwise beat the space login (Claude Code
prefers `ANTHROPIC_API_KEY` over `CLAUDE_CONFIG_DIR`; gh prefers `GH_TOKEN` over
`GH_CONFIG_DIR`). `ResolveSpaceEnvironmentUseCase` adds the refusal message when the space
does not allow the agent type about to run.

It reaches agent processes at two choke points:

- **Feature runs.** The forked worker (`feature-agent-worker.ts`) calls
  `applyRunSpaceEnvironment` right after claiming the run, resolving from `--repo` (never the
  worktree). A worker serves one run, so it changes its own `process.env`; every agent CLI
  (`buildSpawnOptions` copies `process.env` at spawn time), `gh` call (`ExecFunction`) and
  `git` call inherits it. A refused agent fails the run before the graph starts.
- **Feature chats.** The daemon runs sessions of many spaces at once, so
  `SessionSpaceEnvironment` resolves per session and the bootstrapper passes
  `InteractiveAgentOptions.environment`, applied by the Claude SDK executor and by
  `buildSpawnOptions` for ACP agents.

Anything that reads Claude's directory uses `claudeConfigDir()`, which honours
`CLAUDE_CONFIG_DIR`. `tests/unit/architecture/shep-home-paths.test.ts` keeps every Shep home
lookup on `getShepHomeDir()`.

## Surfaces

| Surface | Entry point                                                       |
| ------- | ----------------------------------------------------------------- |
| CLI     | `src/presentation/cli/commands/space/` (`shep space …`)           |
| Web     | `/spaces` (`components/features/spaces/`), `/memory` scope menu    |
| DI      | `infrastructure/di/modules/register-spaces.ts`                     |
| Worker  | `agents/feature-agent/apply-space-environment.ts`                  |
| Chat    | `interactive/lifecycle/session-space-environment.ts`               |
