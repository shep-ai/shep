## Status

- **Phase:** Implementation
- **Updated:** 2026-11-01

## Architecture Overview

```
shep-cli (binary: `shep`)
  ├── surfaces: CLI (4 commands) · terminal UI · MCP server · JSON-RPC daemon
  └── wires ports to adapters
shep-infra   SQLite store · git worktrees · agent runner + PTY holder · gh · sources · keychain
shep-app     the 4 core actions (add, start, board, review) + port traits
shep-domain  Task, TaskState machine, TaskSource kind, ReviewAction — no I/O
```

Clean Architecture, as in Shep 1: dependencies point inward (cli → infra → app → domain),
enforced by the crate graph. Every
surface calls only the four core actions. The Mac app talks to the daemon over JSON-RPC.

## Implementation Strategy

**MANDATORY TDD**: every phase with code starts with failing tests (RED → GREEN → REFACTOR).

Build outward from the domain. Phase 2 already gives a usable local loop (`shep add`, `shep`
prints the board, `shep go` marks work started) on SQLite. Phase 3 moves state behind the
daemon so every surface shares it. Phase 4 makes tasks real: worktree, agent, draft PR, CI
fixes, proof. Phases 5–7 add the terminal UI, MCP and sources, all on the same four actions.
Phase 8 needs a Mac (macOS runner or the owner's machine). Phase 9 ships binaries.

## Testing Strategy (TDD: Tests FIRST)

### Unit Tests

- Domain: every allowed and refused state transition; source references parse and display
- App: each core action against in-memory port fakes
- Infra: SQLite store against a temporary database; git worktrees against a temp repository

### Integration Tests

- CLI end to end with `SHEP_HOME` pointed at a temp dir (assert_cmd)
- Daemon: a client round-trip over the socket; the OpenRPC schema only grows
- Agent run with a fake agent binary that edits a file and exits

## Risk Mitigation

| Risk | Mitigation |
| ---- | ---------- |
| Porting Shep 1 logic takes longer than expected | Port only the trimmed engine pieces listed in the spec; everything else is out of scope |
| Mac app cannot be built in a Linux sandbox | macOS GitHub Actions runner for build and tests; owner's Mac for system surfaces |
| Source APIs need real workspaces | Adapters built against recorded fixtures first; real tokens later as environment secrets |
| Agents misbehave overnight | Draft PRs only, branch-only pushes enforced in code, three CI-fix attempts then Needs you |

---

_See tasks.yaml for the detailed task breakdown_
