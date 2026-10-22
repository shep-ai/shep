/**
 * Coasts Service Implementation
 *
 * Infrastructure adapter wrapping the coast CLI binary for containerized
 * runtime isolation. Uses constructor-injected ExecFunction for subprocess
 * invocation and IStructuredAgentCaller for AI-powered Coastfile generation.
 *
 * Following Clean Architecture:
 * - Implements the ICoastsService application port
 * - Lives in the infrastructure layer
 * - No direct child_process imports (injected via ExecFunction)
 */

import { existsSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { injectable, inject } from 'tsyringe';
import type {
  ICoastsService,
  PrerequisiteCheckResult,
  CoastInstance,
} from '../../application/ports/output/services/coasts-service.interface.js';
import type { IStructuredAgentCaller } from '../../application/ports/output/agents/structured-agent-caller.interface.js';
import type { ExecFunction } from './git/worktree.service.js';
import { IS_WINDOWS } from '../platform.js';
import { COASTFILE_GENERATION_PROMPT } from './coasts/coastfile-generation.prompt.js';

/** Timeout for coast build (may need to pull Docker images). */
const BUILD_TIMEOUT_MS = 30_000;

/** Timeout for all other coast CLI commands. */
const DEFAULT_TIMEOUT_MS = 10_000;

/** Max attempts for the generate → build → fix loop. */
const MAX_BUILD_RETRIES = 3;

/** JSON schema for Coastfile generation via structured agent caller. */
const COASTFILE_SCHEMA = {
  type: 'object',
  properties: {
    content: {
      type: 'string',
      description: 'The complete Coastfile content in TOML format',
    },
    warnings: {
      type: 'array',
      items: { type: 'string' },
      description: 'Any warnings or notes about the generated Coastfile',
    },
  },
  required: ['content'],
  additionalProperties: false,
} as const;

interface CoastfileGenerationResult {
  content: string;
  warnings?: string[];
}

@injectable()
export class CoastsService implements ICoastsService {
  private readonly isWindows: boolean;

  constructor(
    @inject('ExecFunction') private readonly execFile: ExecFunction,
    @inject('IStructuredAgentCaller') private readonly structuredCaller: IStructuredAgentCaller,
    isWindows?: boolean
  ) {
    this.isWindows = isWindows ?? IS_WINDOWS;
  }

  async checkPrerequisites(workDir: string): Promise<PrerequisiteCheckResult> {
    if (this.isWindows) {
      return {
        coastBinary: false,
        docker: false,
        coastdRunning: false,
        allMet: false,
        missingMessages: [
          'Coasts dev server is not supported on Windows. See https://coasts.dev/docs for platform support.',
        ],
      };
    }

    const [coastResult, dockerResult, coastdResult] = await Promise.allSettled([
      this.checkCoastBinary(),
      this.checkDocker(),
      this.checkCoastdRunning(workDir),
    ]);

    const coastBinary = coastResult.status === 'fulfilled';
    const docker = dockerResult.status === 'fulfilled';
    const coastdRunning = coastdResult.status === 'fulfilled';

    const missingMessages: string[] = [];
    if (!coastBinary) {
      missingMessages.push(
        'coast binary not found on PATH. Install it with: curl -fsSL https://coasts.dev/install | sh. See https://coasts.dev/docs'
      );
    }
    if (!docker) {
      missingMessages.push(
        'Docker daemon is not reachable. Start Docker Desktop or run: sudo systemctl start docker'
      );
    }
    if (!coastdRunning) {
      missingMessages.push(
        'coastd daemon is not running. Start it with: coastd &. See https://coasts.dev/docs/daemon'
      );
    }

    return {
      coastBinary,
      docker,
      coastdRunning,
      allMet: coastBinary && docker && coastdRunning,
      missingMessages,
    };
  }

  async build(workDir: string): Promise<void> {
    try {
      await this.execCoast(['build'], workDir, BUILD_TIMEOUT_MS);
    } catch (error: unknown) {
      const stderr =
        error instanceof Error && 'stderr' in error ? (error as { stderr: string }).stderr : '';
      const stdout =
        error instanceof Error && 'stdout' in error ? (error as { stdout: string }).stdout : '';
      const logs = [stderr, stdout].filter(Boolean).join('\n').trim();
      const message = logs
        ? `coast build failed:\n${logs}`
        : `coast build failed: ${error instanceof Error ? error.message : String(error)}`;
      throw new Error(message);
    }
  }

  async run(workDir: string): Promise<CoastInstance> {
    const { stdout } = await this.execCoast(['run'], workDir);
    return this.parseCoastInstance(stdout);
  }

  async stop(workDir: string): Promise<void> {
    try {
      await this.execCoast(['stop'], workDir);
    } catch {
      // No-op if no instance is running
    }
  }

  async lookup(workDir: string): Promise<CoastInstance | null> {
    try {
      const { stdout } = await this.execCoast(['lookup'], workDir);
      return this.parseCoastInstance(stdout);
    } catch {
      return null;
    }
  }

  async isRunning(workDir: string): Promise<boolean> {
    const instance = await this.lookup(workDir);
    return instance !== null;
  }

  async checkout(workDir: string): Promise<void> {
    await this.execCoast(['checkout'], workDir);
  }

  async generateCoastfile(workDir: string): Promise<string> {
    const coastfilePath = path.join(workDir, 'Coastfile');
    let buildError: string | null = null;

    for (let attempt = 0; attempt < MAX_BUILD_RETRIES; attempt++) {
      const prompt = buildError
        ? `${COASTFILE_GENERATION_PROMPT}\n\nThe previous Coastfile failed \`coast build\` with this error:\n\`\`\`\n${buildError}\n\`\`\`\n\nFix the Coastfile to resolve this error. Return the corrected Coastfile content as valid TOML in the "content" field.`
        : `${COASTFILE_GENERATION_PROMPT}\n\nAnalyze the project at the working directory and generate a Coastfile.\nReturn the complete Coastfile content as valid TOML in the "content" field.`;

      const result = await this.structuredCaller.call<CoastfileGenerationResult>(
        prompt,
        COASTFILE_SCHEMA,
        {
          cwd: workDir,
          allowedTools: [],
          silent: true,
          maxTurns: 10,
        }
      );

      writeFileSync(coastfilePath, result.content, 'utf-8');

      try {
        await this.execCoast(['build'], workDir, BUILD_TIMEOUT_MS);
        return coastfilePath;
      } catch (error: unknown) {
        const stderr =
          error instanceof Error && 'stderr' in error ? (error as { stderr: string }).stderr : '';
        const stdout =
          error instanceof Error && 'stdout' in error ? (error as { stdout: string }).stdout : '';
        buildError = [stderr, stdout].filter(Boolean).join('\n').trim();

        if (!buildError) {
          buildError = error instanceof Error ? error.message : String(error);
        }
      }
    }

    throw new Error(`coast build failed after ${MAX_BUILD_RETRIES} attempts:\n${buildError}`);
  }

  async hasCoastfile(workDir: string): Promise<boolean> {
    return existsSync(path.join(workDir, 'Coastfile'));
  }

  // --- Private helpers ---

  private async checkCoastBinary(): Promise<void> {
    await this.execFile('coast', ['--version'], { timeout: 500 });
  }

  private async checkDocker(): Promise<void> {
    await this.execFile('docker', ['info'], { timeout: 500 });
  }

  private async checkCoastdRunning(workDir: string): Promise<void> {
    await this.execFile('coast', ['ls'], { cwd: workDir, timeout: 500 });
  }

  private async execCoast(
    args: string[],
    workDir: string,
    timeout: number = DEFAULT_TIMEOUT_MS
  ): Promise<{ stdout: string; stderr: string }> {
    return this.execFile('coast', args, { cwd: workDir, timeout });
  }

  /**
   * Parse coast CLI output to extract port and URL from stdout.
   * Looks for patterns like "port 3000" and "http://localhost:3000".
   */
  private parseCoastInstance(stdout: string): CoastInstance {
    const portMatch = stdout.match(/port\s+(\d+)/i);
    const urlMatch = stdout.match(/(https?:\/\/[^\s]+)/i);

    const port = portMatch ? parseInt(portMatch[1], 10) : 3000;
    const url = urlMatch ? urlMatch[1] : `http://localhost:${port}`;

    return { port, url };
  }
}
