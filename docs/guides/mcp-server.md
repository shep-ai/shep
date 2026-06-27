# MCP Server

## What Is MCP?

Shep includes an MCP (Model Context Protocol) server so AI clients can discover
and call Shep tools directly. The server runs in the foreground over stdio, so
your MCP client starts `shep mcp` and communicates with it through stdin/stdout.

## When to Use `shep mcp`

Use this when you want Claude Desktop, Cursor, VS Code, or another MCP client to
create and inspect Shep features, run agents, list repositories, or update Shep
settings without leaving the client.

## Start the Server

```bash
shep mcp
```

The command writes JSON-RPC messages over stdio. Diagnostic output goes to
stderr so it does not interfere with the protocol.

For troubleshooting, start the server with debug logging:

```bash
shep mcp --log-level debug
```

## Claude Desktop Configuration

Add Shep to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "shep": {
      "command": "shep",
      "args": ["mcp"]
    }
  }
}
```

Restart Claude Desktop after saving the file.

## Cursor and VS Code Configuration

The same `command` and `args` shape works for Cursor and VS Code MCP clients.
For Cursor, add this to `~/.cursor/mcp.json`. For VS Code, add it to your MCP
extension configuration:

```json
{
  "mcpServers": {
    "shep": {
      "command": "shep",
      "args": ["mcp"]
    }
  }
}
```

## Tools

### Features

| Tool name        | Description                                                                                                                 |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `list_features`  | List all features tracked by Shep. Optionally filter by lifecycle status.                                                   |
| `show_feature`   | Get detailed information about a feature by ID. Supports prefix matching.                                                   |
| `create_feature` | Create a new feature from a natural language description and repository path.                                                |
| `start_feature`  | Start a pending feature. Triggers an agent run and returns the run ID immediately without blocking.                          |

### Agents

| Tool name          | Description                                                                                      |
| ------------------ | ------------------------------------------------------------------------------------------------ |
| `run_agent`        | Run a named agent with a prompt. Returns the agent run ID immediately without blocking.           |
| `show_agent_run`   | Get the status and details of an agent run by its ID.                                             |
| `list_agent_runs`  | List all agent runs, sorted by most recent first.                                                 |
| `stop_agent_run`   | Stop a running agent by its run ID. Returns whether the stop was successful.                      |

### Repositories

| Tool name           | Description                           |
| ------------------- | ------------------------------------- |
| `list_repositories` | List all repositories tracked by Shep. |

### Settings

| Tool name         | Description                                                                                  |
| ----------------- | -------------------------------------------------------------------------------------------- |
| `get_settings`    | Get current Shep settings including models, agent, environment, and workflow configuration.   |
| `update_settings` | Update Shep settings. Pass the full settings object with desired changes.                     |

## Troubleshooting

If your MCP client cannot connect:

1. Run `shep mcp --log-level debug` from a terminal and check stderr output.
2. Confirm `shep` is on the same `PATH` that your MCP client uses.
3. Restart the MCP client after changing its configuration file.
4. Make sure the config uses `"command": "shep"` and `"args": ["mcp"]`.

## Next Steps

- Review [cli-commands.md](./cli-commands.md) for other Shep commands.
- Read [configuration.md](./configuration.md) for agent and model settings.
