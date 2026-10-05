# Docs first

Spec: [`specs/131-docs-first`](../../specs/131-docs-first/). User guide:
[`docs/guides/spaces.md`](../guides/spaces.md#docs-first).

## Policy

`SpaceAgentSettings` gains `docsFirst` and `docsPaths` (`tsp/domain/entities/space.tsp`).
`ConfigureSpaceAgentUseCase` normalises each path with `normalizeDocsPath`: forward slashes, no
leading `./`, a trailing `/` kept to mark a directory, and absolute or `..` paths refused.

## Rules (`domain/shared/docs-first.ts`)

- `DEFAULT_DOCS_PATHS`: `docs/`, `README.md`; `docsPathsOf(settings)` picks the space's own.
- `documentationChanges(files, paths)`: changed files under a directory prefix or equal to a file
  prefix. Any-Markdown matching is deliberately avoided — shep's own specs are Markdown inside
  the worktree.
- `docsFirstInstructions(phase, paths)`: the plan and implement sections; empty for other phases.

## Instructions

`SelectProjectMemoryUseCase` resolves the repository's space once and, when it has docs first
on, appends `docsFirstInstructions(phase, …)` after the memory and team knowledge. Every
feature-agent phase already receives the blob selected for it, so no prompt builder changes.

## Gate

`CheckDocsGateUseCase.execute(repositoryPath, changedFiles)` returns `DocsGate` (`required`,
`passed`, `docsPaths`, `documentation`). The merge node's `checkDocsGate` dependency
(wired in `feature-agent-worker.ts`) is called by `docsBlockAutoMerge`
(`nodes/merge/docs-gate.ts`) after commit and push with the paths from
`IGitPrService.getFileDiffs`. A blocked gate — or changed files that cannot be listed in a
docs-first space — sets `docsBlocksAutoMerge`, which, like `ciBlocksAutoMerge`, opens the human
merge gate and keeps auto-merge off. Approving the gate merges as usual.
