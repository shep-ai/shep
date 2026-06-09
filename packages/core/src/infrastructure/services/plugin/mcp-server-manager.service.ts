/**
 * MCP Server Manager Service
 *
 * Manages MCP server process lifecycle for plugin system.
 * Uses child_process.spawn() with reference counting for concurrent features.
 * Generates per-feature temp .mcp.json config files for agent executors.
 *
 * Follows the ClaudeCodeExecutorService pattern for process spawning:
 * - No shell: true (prevents injection)
 * - Command and args as arrays
 * - Explicit env var passing
 */

import { injectable, inject } from 'tsyringe';
import { writeFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { PluginType, type Plugin } from '../../../domain/generated/output.js';
import type {
  IMcpServerManager,
  ActiveMcpServer,
} from '../../../application/ports/output/services/mcp-server-manager.interface.js';
import { IS_WINDOWS } from '../../platform.js';

/** Type for the spawn function — matches node:child_process.spawn signature */
export type SpawnFn = (
  command: string,
  args: string[],
  options: Record<string, unknown>
) => {
  pid?: number;
  kill: (signal?: string) => void;
  on: (event: string, handler: (...args: unknown[]) => void) => void;
  stdout: { on: (event: string, handler: (...args: unknown[]) => void) => void } | null;
  stderr: { on: (event: string, handler: (...args: unknown[]) => void) => void } | null;
};

/** Tracked server process with metadata */
interface ManagedServer {
  pluginName: string;
  process: ReturnType<SpawnFn>;
  referenceCount: number;
  env: Record<string, string>;
  command: string;
  args: string[];
}

/** Per-feature tracking: which plugins are active and config file path */
interface FeatureEntry {
  pluginNames: Set<string>;
  configPath: string | null;
}

@injectable()
export class McpServerManagerService implements IMcpServerManager {
  /** Shared server pool keyed by plugin name */
  private servers = new Map<string, ManagedServer>();
  /** Per-feature tracking */
  private features = new Map<string, FeatureEntry>();

  constructor(@inject('SpawnFunction') private readonly spawn: SpawnFn) {}

  async startServersForFeature(featureId: string, plugins: Plugin[]): Promise<void> {
    const mcpPlugins = plugins.filter((p) => p.type === PluginType.Mcp && p.serverCommand);

    if (mcpPlugins.length === 0) return;

    const entry: FeatureEntry = this.features.get(featureId) ?? {
      pluginNames: new Set(),
      configPath: null,
    };

    for (const plugin of mcpPlugins) {
      const existing = this.servers.get(plugin.name);
      if (existing) {
        // Shared server — increment reference count
        existing.referenceCount++;
        entry.pluginNames.add(plugin.name);
        continue;
      }

      // Build environment for the child process
      const env = this.buildServerEnv(plugin);

      const proc = this.spawn(plugin.serverCommand!, plugin.serverArgs ?? [], {
        stdio: ['pipe', 'pipe', 'pipe'],
        env,
        ...(IS_WINDOWS ? { windowsHide: true } : {}),
      });

      // Track unexpected exits
      proc.on('exit', () => {
        this.servers.delete(plugin.name);
      });

      this.servers.set(plugin.name, {
        pluginName: plugin.name,
        process: proc,
        referenceCount: 1,
        env,
        command: plugin.serverCommand!,
        args: plugin.serverArgs ?? [],
      });

      entry.pluginNames.add(plugin.name);
    }

    this.features.set(featureId, entry);
  }

  async stopServersForFeature(featureId: string): Promise<void> {
    const entry = this.features.get(featureId);
    if (!entry) return;

    for (const pluginName of entry.pluginNames) {
      const server = this.servers.get(pluginName);
      if (!server) continue;

      server.referenceCount--;
      if (server.referenceCount <= 0) {
        this.killProcess(server);
        this.servers.delete(pluginName);
      }
    }

    // Clean up temp config file
    if (entry.configPath) {
      try {
        unlinkSync(entry.configPath);
      } catch {
        // File already deleted or never created
      }
    }

    this.features.delete(featureId);
  }

  getActiveServers(featureId: string): ActiveMcpServer[] {
    const entry = this.features.get(featureId);
    if (!entry) return [];

    const result: ActiveMcpServer[] = [];
    for (const pluginName of entry.pluginNames) {
      const server = this.servers.get(pluginName);
      if (server) {
        result.push({
          pluginName: server.pluginName,
          pid: server.process.pid ?? 0,
          referenceCount: server.referenceCount,
        });
      }
    }
    return result;
  }

  async generateMcpConfigPath(featureId: string): Promise<string | null> {
    const entry = this.features.get(featureId);
    if (!entry || entry.pluginNames.size === 0) return null;

    // Return cached path if already generated
    if (entry.configPath) return entry.configPath;

    const mcpServers: Record<
      string,
      { type: string; command: string; args: string[]; env: Record<string, string> }
    > = {};

    for (const pluginName of entry.pluginNames) {
      const server = this.servers.get(pluginName);
      if (!server) continue;

      mcpServers[pluginName] = {
        type: 'stdio',
        command: server.command,
        args: server.args,
        env: server.env,
      };
    }

    if (Object.keys(mcpServers).length === 0) return null;

    const configPath = join(tmpdir(), `shep-mcp-${featureId}.json`);
    writeFileSync(configPath, JSON.stringify({ mcpServers }, null, 2), 'utf-8');
    entry.configPath = configPath;

    return configPath;
  }

  /**
   * Kill all managed servers and clean up all temp files.
   * Called on SIGTERM, SIGINT, beforeExit, and explicit shutdown.
   */
  async shutdown(): Promise<void> {
    for (const server of this.servers.values()) {
      this.killProcess(server);
    }
    this.servers.clear();

    for (const entry of this.features.values()) {
      if (entry.configPath) {
        try {
          unlinkSync(entry.configPath);
        } catch {
          // Already cleaned up
        }
      }
    }
    this.features.clear();
  }

  /**
   * Build the environment object for a server child process.
   * Only includes PATH and explicitly required env vars — no wholesale inheritance.
   */
  private buildServerEnv(plugin: Plugin): Record<string, string> {
    const env: Record<string, string> = {};

    // Always pass PATH so the server can find its runtime
    if (process.env.PATH) {
      env.PATH = process.env.PATH;
    }

    // Pass required env vars from the host environment
    for (const varName of plugin.requiredEnvVars ?? []) {
      const value = process.env[varName];
      if (value) {
        env[varName] = value;
      }
    }

    // Pass active tool groups via the standard env var
    if (plugin.activeToolGroups && plugin.activeToolGroups.length > 0) {
      env.CLAUDE_FLOW_TOOL_GROUPS = plugin.activeToolGroups.join(',');
    }

    return env;
  }

  /** Send SIGTERM to a managed server process */
  private killProcess(server: ManagedServer): void {
    try {
      server.process.kill('SIGTERM');
    } catch {
      // Process may have already exited
    }
  }
}
