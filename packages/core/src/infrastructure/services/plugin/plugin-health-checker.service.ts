/**
 * Plugin Health Checker Service
 *
 * Implements multi-tier health checks for plugins:
 * Tier 1: Runtime on PATH (python3/node via which)
 * Tier 2: Package installed (future - pip show/npx check)
 * Tier 3: Required env vars present in process.env
 *
 * Follows ToolInstallerService pattern for runtime detection.
 */

import { injectable } from 'tsyringe';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { PluginHealthStatus, type Plugin } from '../../../domain/generated/output.js';
import type {
  IPluginHealthChecker,
  PluginHealthResult,
} from '../../../application/ports/output/services/plugin-health-checker.interface.js';
import { IS_WINDOWS } from '../../platform.js';

const RUNTIME_BINARIES: Record<string, string[]> = {
  python: IS_WINDOWS ? ['python', 'python3'] : ['python3', 'python'],
  node: ['node'],
};

const WHICH_COMMAND = IS_WINDOWS ? 'where' : 'which';
const EXEC_TIMEOUT_MS = 5000;

@injectable()
export class PluginHealthCheckerService implements IPluginHealthChecker {
  private execFileAsync = promisify(execFile);

  async checkHealth(plugin: Plugin): Promise<PluginHealthResult> {
    const checks: string[] = [];

    // Tier 1: Runtime availability
    if (plugin.runtimeType) {
      const runtimeFound = await this.checkRuntime(plugin.runtimeType);
      if (!runtimeFound) {
        return {
          pluginName: plugin.name,
          status: PluginHealthStatus.Unavailable,
          message: `Required runtime "${plugin.runtimeType}" not found on PATH. Install ${plugin.runtimeType}${plugin.runtimeMinVersion ? ` ${plugin.runtimeMinVersion}+` : ''} and try again.`,
        };
      }
      checks.push(`Runtime "${plugin.runtimeType}" found`);
    }

    // Tier 3: Environment variables
    const missingEnvVars = this.checkEnvVars(plugin.requiredEnvVars ?? []);
    if (missingEnvVars.length > 0) {
      return {
        pluginName: plugin.name,
        status: PluginHealthStatus.Degraded,
        message: `Missing required environment variables: ${missingEnvVars.join(', ')}. Add them to your shell profile or .env file.`,
      };
    }
    if ((plugin.requiredEnvVars ?? []).length > 0) {
      checks.push('All required env vars set');
    }

    return {
      pluginName: plugin.name,
      status: PluginHealthStatus.Healthy,
      message: checks.length > 0 ? checks.join('; ') : 'No runtime requirements',
    };
  }

  async checkAllHealth(plugins: Plugin[]): Promise<PluginHealthResult[]> {
    return Promise.all(plugins.map((plugin) => this.checkHealth(plugin)));
  }

  /**
   * Check if a runtime binary exists on PATH.
   * Tries multiple binary names (e.g., python3 then python for python type).
   */
  private async checkRuntime(runtimeType: string): Promise<boolean> {
    const binaries = RUNTIME_BINARIES[runtimeType] ?? [runtimeType];

    for (const binary of binaries) {
      try {
        await this.execFileAsync(WHICH_COMMAND, [binary], {
          timeout: EXEC_TIMEOUT_MS,
        });
        return true;
      } catch {
        // Binary not found, try next
      }
    }
    return false;
  }

  /**
   * Check that all required environment variables are present in process.env.
   * Returns the names of missing variables.
   */
  private checkEnvVars(requiredVars: string[]): string[] {
    return requiredVars.filter((varName) => !process.env[varName] || process.env[varName] === '');
  }
}
