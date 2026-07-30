# Evidence — MCP Integration (#832)

Visual and test evidence for MCP support: work-item (task management) MCP
tools plus the web settings UI that documents them.

## Screenshots

`McpIntegrationSection` rendered via Storybook
(`Features/Settings/McpIntegrationSection`).

| File | Description |
| --- | --- |
| `mcp-default-light.png` | Full tool catalog (17 tools) with copyable config snippet — light theme. The 6 new task-management tools are badged **New**. |
| `mcp-default-dark.png` | Same, dark theme. |
| `mcp-tasktools-light.png` | `TaskToolsOnly` story — the new task-management tool group in isolation. |

## Tests

`mcp-test-results.txt` — full MCP unit + integration suite (95 tests passing),
covering the four existing tool groups and the new `work-item-tools`.
