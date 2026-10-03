/** Environment checks behind `shep doctor`'s harness diagnostic (spec 119). */
import { execFile } from 'node:child_process';
import { access, constants, mkdir } from 'node:fs/promises';
import { promisify } from 'node:util';
import type { AgentType } from '../../../domain/generated/output.js';
import type { IHarnessEnvironmentProbe } from '../../../application/ports/output/harness/index.js';
import { resolveBackendCredential } from './model/harness-model-provider-factory.js';

const execFileAsync = promisify(execFile);
const PROBE_TIMEOUT_MS = 5000;

export class HarnessEnvironmentProbe implements IHarnessEnvironmentProbe {
  constructor(
    private readonly objectsDir: string,
    private readonly env: Readonly<Record<string, string | undefined>> = process.env
  ) {}

  hasBackendCredential(backend: AgentType, configuredToken?: string): boolean {
    return resolveBackendCredential(backend, configuredToken, this.env) !== undefined;
  }

  envVarSet(name: string): boolean {
    return Boolean(this.env[name]?.trim());
  }

  async commandAvailable(command: string): Promise<boolean> {
    try {
      await execFileAsync(command, ['--version'], { timeout: PROBE_TIMEOUT_MS, windowsHide: true });
      return true;
    } catch {
      return false;
    }
  }

  async storageWritable(): Promise<boolean> {
    try {
      await mkdir(this.objectsDir, { recursive: true });
      await access(this.objectsDir, constants.W_OK);
      return true;
    } catch {
      return false;
    }
  }
}
