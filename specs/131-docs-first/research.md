## Findings

- `MemorySelector` is called with the node name as `phase`.
- The merge node already forces the human gate when CI is unverified (`ciBlocksAutoMerge`).
- `IGitPrService.getFileDiffs(cwd, baseBranch)` lists the changed paths.
