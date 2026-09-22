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
import { execFileSync } from 'node:child_process';
import { writeFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { PluginType, type Plugin } from '../../../domain/generated/output.js';
import type {
  IMcpServerManager,
  ActiveMcpServer,
} from '../../../application/ports/output/services/mcp-server-manager.interface.js';
import { IS_WINDOWS } from '../../platform.js';
import { SIGKILL_GRACE_MS } from '../agents/common/executors/process-stream.js';

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

/**
 * How long to wait for the OS to reap a process after SIGKILL.
 *
 * SIGKILL cannot be caught, so this is not about giving the child a chance to
 * clean up — it is only about letting the kernel deliver the `exit` event. Kept
 * short because a caller that is already tearing down must not be stalled by a
 * process that refused every polite request.
 */
export const REAP_GRACE_MS = 250;

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
        // Drop the entry first: an exit listener registered by killProcess must
        // not resurrect it, and a late exit for a released server is expected.
        this.servers.delete(pluginName);
        await this.killProcess(server);
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

    // Unique per write, not per feature. Every worker process owns its own
    // manager, and supervisor auto-approve starts the next worker for a feature
    // while the previous one is still tearing down — a feature-derived path
    // let the old worker's cleanup delete the file the new worker had just
    // written. Each manager only ever unlinks the path it generated.
    const configPath = join(tmpdir(), `shep-mcp-${featureId}-${randomUUID()}.json`);
    writeFileSync(configPath, JSON.stringify({ mcpServers }, null, 2), 'utf-8');
    entry.configPath = configPath;

    return configPath;
  }

  /**
   * Kill all managed servers and clean up all temp files.
   * Called on SIGTERM, SIGINT, beforeExit, and explicit shutdown.
   *
   * Resolves only once every server has actually exited, so a caller that
   * deletes files the child was holding (a worktree, a temp config) afterwards
   * cannot race the OS still keeping those handles open on Windows.
   */
  async shutdown(): Promise<void> {
    const pending = [...this.servers.values()].map((server) => this.killProcess(server));
    this.servers.clear();

    await Promise.allSettled(pending);

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

  /**
   * Terminate a managed server and wait for it to actually exit.
   *
   * SIGTERM is a request the child may ignore — an MCP server blocked on its
   * own child routinely does. So this waits for the `exit` event and escalates
   * to SIGKILL after {@link SIGKILL_GRACE_MS}, mirroring
   * `terminateWithEscalation` in the agent executors. Without the wait, a
   * caller that removes what the server was holding (a worktree, a temp config)
   * races the OS: on Windows the child's handle on its cwd stays open until the
   * process dies, and the removal fails with EBUSY. See LESSONS.md —
   * "`kill()` is a signal, not a join".
   *
   * The exit listener is attached *before* the signal is sent: the registry
   * drops the entry on exit, so a listener added afterwards is never reached.
   *
   * Never rejects — a server that is already gone is the expected case.
   */
  private async killProcess(server: ManagedServer): Promise<void> {
    // The exit listener is attached before any signal is sent — see the note
    // above about the registry dropping the entry on exit.
    const exited = new Promise<void>((resolve) => {
      server.process.on('exit', () => resolve());
    });

    const pid = server.process.pid;
    const signalTree = (force: boolean) => {
      if (!pid) return;
      try {
        execFileSync('taskkill', ['/T', ...(force ? ['/F'] : []), '/PID', String(pid)], {
          stdio: 'ignore',
        });
      } catch {
        // taskkill unavailable or the pid is already gone — fall through.
      }
    };

    // Windows: signal the whole tree, not just the direct child. An MCP server
    // launched through a wrapper script leaves the real process running when
    // only the child is killed. Without /F first, so the server can still
    // flush and close its own children.
    if (IS_WINDOWS) {
      signalTree(false);
    }

    try {
      server.process.kill('SIGTERM');
    } catch {
      // Process may have already exited.
    }

    const grace = () =>
      new Promise<void>((resolve) => {
        setTimeout(resolve, SIGKILL_GRACE_MS).unref?.();
      });

    const stillAlive = await Promise.race([exited.then(() => false), grace().then(() => true)]);

    if (stillAlive) {
      if (IS_WINDOWS) {
        signalTree(true);
      }
      try {
        server.process.kill('SIGKILL');
      } catch {
        // Already gone — the expected case.
      }
      // SIGKILL cannot be caught, so the kernel reaps the process on its own
      // schedule. Waiting another full grace would only stall a caller that is
      // already tearing down, so give it a short window and move on.
      await Promise.race([
        exited,
        new Promise<void>((r) => setTimeout(r, REAP_GRACE_MS).unref?.()),
      ]);
    }
  }
}
