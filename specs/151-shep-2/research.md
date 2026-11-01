## Status

- **Phase:** Research complete
- **Updated:** 2026-11-01

## Technology Decisions

See the structured `decisions` above. Summary:

| Decision | Chosen |
| -------- | ------ |
| Core language | Rust (no comparison spike; owner decision 2026-11-01) |
| Location | Cargo workspace `shep2/` in this repo |
| Domain source of truth | Rust enums and structs; OpenRPC generated for clients |
| Crates | `shep-domain` → `shep-app` → `shep-infra` → `shep-cli` |
| Storage | SQLite (rusqlite, bundled) |
| Protocol | JSON-RPC 2.0 over a Unix socket, OpenRPC schema |
| Sources | `TaskSource` port, polling, Slack Socket Mode, keychain tokens, no server |
| Agents | portable-pty with a separate PTY holder |

## Library Analysis

| Library | Purpose | Notes |
| ------- | ------- | ----- |
| tokio | Async runtime for daemon, sources, sockets | Standard |
| clap | The four CLI commands | Derive API |
| rusqlite (bundled) | Storage | No system SQLite needed |
| serde / serde_json / schemars | Types, JSON-RPC, OpenRPC | |
| ratatui + crossterm + tachyonfx | Terminal UI and effects | |
| rmcp | MCP server (3 tools) | Official SDK |
| portable-pty | Agent sessions | Used by wezterm |
| keyring | Tokens in the OS keychain | macOS Keychain, Secret Service on Linux |
| thiserror | Typed errors per layer | |

## Security Considerations

- Tokens only in the OS keychain, never in SQLite or logs.
- The Unix socket is created with user-only permissions.
- Shep only pushes task branches and opens draft PRs; pushes to the default branch are refused
  in code, not just by convention.
- Source adapters write only replies, status changes and links.

## Performance Implications

Idle daemon target: under 30 MB resident, no busy polling (sources every few minutes, agents
event-driven). Measured and reported per the success criteria.

## Open Questions

None blocking. The npm package name is tracked in spec.yaml.
