## Problem Statement

Two adjacent gaps keep an existing development machine outside of shep.

**Bulk import.** A user with dozens of repositories under `~/Code` has no way
to bring them in as a set. `AddRepositoryUseCase` handles a single path well
(normalisation, dedupe by path, soft-delete restore), but the only caller is
a web folder picker invoked once per repo, and the CLI's `shep repo add` is
GitHub-clone-only — the path-based use case has no CLI surface. Nothing in
the codebase enumerates a parent directory's children as import candidates.

**In-flight sessions are visible but inert.** Discovery is already solid:
`claude-code-session.repository.ts` and `codex-cli-session.repository.ts`
parse `~/.claude/projects/*.jsonl` behind `IAgentSessionRepository`, and
`FeatureSessionsDropdown` renders per-repo sessions on the canvas with an
active-in-the-last-five-minutes indicator. But the only actions offered are
copy-to-clipboard and a `vscode://file` link. A user who was mid-conversation
in Claude Code cannot pick that conversation up inside shep.

Three concrete defects sit underneath this:

1. **The adoption path is a presentation-layer stopgap.**
   `repository-node.tsx:94-121` assembles the agent prompt string inside a
   React component and pushes it through a URL query parameter. It never
   reads the transcript — it embeds the JSONL path and tells the agent to
   read it. This violates the project's "logic lives in core, not
   presentation" and "use cases are the only entry point" rules, and it makes
   adoption quality depend on the agent choosing to follow instructions.

2. **The copied resume command is wrong.**
   `feature-sessions-dropdown.tsx:271` emits
   `claude --resume <id> --project <path>`. Claude Code has no `--project`
   flag; resume resolves the session from the working directory. Pasting the
   command fails.

3. **Session scanning is implemented twice and the two copies disagree.**
   `src/presentation/web/lib/session-scanner.ts` re-implements JSONL
   discovery in the web layer with its own path-encoding helpers, and it
   scans Cursor directories that core does not — core's Cursor session
   repository is `stub-session.repository.ts`. Meanwhile the core port
   supports a `projectPath` filter the web copy lacks. Two encoders for the
   same on-disk convention will keep drifting.

## Success Criteria

- [ ] Pointing shep at a parent directory lists every immediate subfolder as
      an import candidate, each annotated with whether it is a git repository
      and whether shep already tracks it. No candidate is filtered out on the
      user's behalf, and the scan does not recurse.
- [ ] Selected candidates can be imported as a batch in one action, with a
      per-path result so partial failures are visible rather than silent.
- [ ] The same discovery and import use cases drive both the web UI and a new
      CLI surface — no logic duplicated per presentation layer.
- [ ] Adopting a session creates a feature whose name, description, and
      remaining-work summary are derived in core from the actual transcript,
      read through the existing `IAgentSessionRepository` port and summarised
      via `IAgentExecutorProvider`.
- [ ] Adoption falls back to deterministic extraction when the summarisation
      call fails, so it never hard-fails.
- [ ] An adopted feature lands in Requirements — no branch is created and no
      agent run starts until the user acts.
- [ ] The originating session id and agent type are persisted on the feature,
      so an adopted feature is traceable back to the conversation it came
      from.
- [ ] `repository-node.tsx` no longer builds prompts; it calls a use case.
- [ ] A session can be resumed in shep's embedded PTY terminal at the repo
      working directory, and opened in VS Code, from the sessions dropdown.
- [ ] Any resume command shep produces or copies actually works when run —
      no `--project` flag.
- [ ] Web session scanning routes through core use cases and
      `session-scanner.ts` is deleted, with Cursor coverage preserved rather
      than regressed.
- [ ] New and changed web components have colocated Storybook stories.

## Affected Areas

| Area | Impact | Reasoning |
| ---- | ------ | --------- |
| `application/use-cases/repositories/` | High | New discovery + bulk import use cases alongside `AddRepositoryUseCase`, which they delegate to per path. |
| `application/use-cases/agents/` | High | New session adoption and resume-descriptor use cases over the existing session repository registry. |
| `application/ports/output/` | Medium | Subfolder listing + git-repo detection needed behind a port; `IFileSystemService` today exposes only `removeDirectory` and `pathExists`. |
| `tsp/domain/entities/feature.tsp` | Medium | New optional fields recording the originating agent session id and agent type; requires codegen plus a SQLite migration. |
| `infrastructure/persistence/migrations/` | Medium | Additive migration for the new Feature columns. |
| `infrastructure/services/agents/sessions/` | High | Transcript reading for adoption, plus a real Cursor session repository replacing the stub so `session-scanner.ts` can be deleted without regressing Cursor coverage. |
| `presentation/cli/commands/repo/` | Medium | New bulk-import command; `add.command.ts` currently exposes only the GitHub path. |
| `presentation/web/components/common/feature-node/feature-sessions-dropdown.tsx` | High | Real resume and adopt actions; broken copied command fixed. |
| `presentation/web/components/common/repository-node/repository-node.tsx` | High | Prompt-building logic removed in favour of a use-case call. |
| `presentation/web/lib/session-scanner.ts` | High | Deleted; `/api/sessions` and `/api/sessions-batch` re-pointed at core. |
| `presentation/web/components/common/add-repository-button/` | Medium | Bulk "import a folder of repos" entry point beside the existing single-folder and GitHub options. |
| terminal + ide use cases | Low | Reused as-is for the secondary resume paths (`CreateTerminalSessionUseCase`, `LaunchIdeUseCase`). |

## Dependencies

No blocking feature dependencies. Reuses existing building blocks:
`AddRepositoryUseCase`, `IAgentSessionRepositoryRegistry`,
`IAgentExecutorProvider`, `CreateFeatureUseCase`,
`CreateTerminalSessionUseCase`, `LaunchIdeUseCase`, and the
`/api/directory/list` + `ReactFileManagerDialog` folder-picking stack.

## Size Estimate

**L** — Two coherent halves that share no code but ship as one workflow.
Part A is a new port plus two use cases and two presentation surfaces. Part B
is the bulk of the work: TypeSpec changes (so codegen plus a migration), an
agent-backed summarisation path with a deterministic fallback, a real Cursor
session repository replacing the stub, deletion of the duplicated web
scanner, replacement of the presentation-layer adoption stopgap with a core
use case, and three resume paths wired to existing services. TDD across both
halves, and the scanner unification carries regression risk for the canvas
session dropdown.

---

_Generated by `/shep-kit:new-feature` — proceed with `/shep-kit:research`_
