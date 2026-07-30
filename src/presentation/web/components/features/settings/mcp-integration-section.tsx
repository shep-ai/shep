'use client';

import { useState } from 'react';
import { Plug, Check, Copy, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';

/** A single MCP tool the shep server exposes. */
export interface McpTool {
  name: string;
  description: string;
  /** Highlight tools shipped as part of the latest capability. */
  isNew?: boolean;
}

/** A named group of related MCP tools. */
export interface McpToolGroup {
  category: string;
  tools: McpTool[];
}

export interface McpIntegrationSectionProps {
  /** Command an MCP client spawns to launch the shep server (first token is the binary). */
  command?: string;
  /** Catalog of tools the server exposes, grouped by category. */
  toolGroups?: McpToolGroup[];
}

const DEFAULT_COMMAND = 'shep mcp';

const DEFAULT_TOOL_GROUPS: McpToolGroup[] = [
  {
    category: 'Features',
    tools: [
      {
        name: 'list_features',
        description: 'List tracked features, optionally by lifecycle status',
      },
      { name: 'show_feature', description: 'Get details for a feature by ID or prefix' },
      {
        name: 'create_feature',
        description: 'Create a new feature from a natural-language request',
      },
      { name: 'start_feature', description: 'Start a pending feature and trigger an agent run' },
    ],
  },
  {
    category: 'Agents',
    tools: [
      { name: 'run_agent', description: 'Run a named agent with a prompt, returns the run ID' },
      { name: 'show_agent_run', description: 'Get the status and details of an agent run' },
      { name: 'list_agent_runs', description: 'List agent runs, most recent first' },
      { name: 'stop_agent_run', description: 'Stop a running agent by its run ID' },
    ],
  },
  {
    category: 'Repositories & Settings',
    tools: [
      { name: 'list_repositories', description: 'List repositories tracked by shep' },
      { name: 'get_settings', description: 'Read the current shep settings' },
      { name: 'update_settings', description: 'Update shep settings' },
    ],
  },
  {
    category: 'Task management',
    tools: [
      { name: 'list_projects', description: 'Discover projects and their IDs', isNew: true },
      { name: 'list_work_items', description: 'List tasks in a project with filters', isNew: true },
      {
        name: 'get_work_item',
        description: 'Fetch a task by UUID or PROJ-42 identifier',
        isNew: true,
      },
      { name: 'create_work_item', description: 'Create a task in a project', isNew: true },
      { name: 'update_work_item', description: 'Update a task’s fields', isNew: true },
      { name: 'delete_work_item', description: 'Delete (soft-delete) a task', isNew: true },
    ],
  },
];

/** Build a claude_desktop_config.json snippet from a spawn command. */
function buildConfigSnippet(command: string): string {
  const [bin, ...args] = command.trim().split(/\s+/);
  return JSON.stringify({ mcpServers: { shep: { command: bin, args } } }, null, 2);
}

export function McpIntegrationSection({
  command = DEFAULT_COMMAND,
  toolGroups = DEFAULT_TOOL_GROUPS,
}: McpIntegrationSectionProps) {
  const [copied, setCopied] = useState(false);
  const configSnippet = buildConfigSnippet(command);
  const toolCount = toolGroups.reduce((sum, group) => sum + group.tools.length, 0);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(configSnippet);
      setCopied(true);
      toast.success('MCP config copied');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Unable to copy config');
    }
  }

  return (
    <Card id="mcp" className="scroll-mt-6" data-testid="mcp-integration-section">
      <CardHeader>
        <div className="flex items-center gap-2">
          <Plug className="text-muted-foreground h-4 w-4" />
          <CardTitle>MCP Integration</CardTitle>
          <Badge variant="secondary" className="text-[10px]">
            Model Context Protocol
          </Badge>
        </div>
        <CardDescription>
          Expose shep to MCP-capable AI agents (Claude Desktop, Cursor, VS Code) over stdio. Agents
          can drive features, agent runs, and task management through {toolCount} tools.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground text-xs font-medium">
              claude_desktop_config.json
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleCopy}
              data-testid="btn-copy-mcp-config"
              aria-label="Copy MCP config"
            >
              {copied ? (
                <Check className="h-3.5 w-3.5 text-green-600" />
              ) : (
                <Copy className="h-3.5 w-3.5" />
              )}
            </Button>
          </div>
          <pre
            className="bg-muted overflow-x-auto rounded-md border p-3 font-mono text-[11px] leading-relaxed"
            data-testid="mcp-config-snippet"
          >
            {configSnippet}
          </pre>
        </div>

        <Separator />

        <div className="space-y-3" data-testid="mcp-tool-catalog">
          {toolGroups.map((group) => (
            <div key={group.category} className="space-y-1.5">
              <div className="text-muted-foreground text-[10px] font-semibold tracking-wider uppercase">
                {group.category}
              </div>
              <ul className="space-y-1">
                {group.tools.map((tool) => (
                  <li
                    key={tool.name}
                    className="flex items-start justify-between gap-3 border-b py-1.5 last:border-b-0"
                    data-testid={`mcp-tool-${tool.name}`}
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <code className="font-mono text-xs">{tool.name}</code>
                        {tool.isNew ? (
                          <Badge
                            className="gap-0.5 px-1 py-0 text-[9px]"
                            data-testid="mcp-tool-new-badge"
                          >
                            <Sparkles className="h-2.5 w-2.5" />
                            New
                          </Badge>
                        ) : null}
                      </div>
                      <p className="text-muted-foreground text-[11px] leading-tight">
                        {tool.description}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
