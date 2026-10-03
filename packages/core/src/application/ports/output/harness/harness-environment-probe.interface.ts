/** Environment checks behind `shep doctor`'s harness diagnostic (spec 119). */
import type { AgentType } from '../../../../domain/generated/output.js';

export interface IHarnessEnvironmentProbe {
  /** A credential (configured token or the backend's env var) is available. */
  hasBackendCredential(backend: AgentType, configuredToken?: string): boolean;
  /** The executable is on PATH. */
  commandAvailable(command: string): Promise<boolean>;
  /** An environment variable is set and non-empty. */
  envVarSet(name: string): boolean;
  /** The harness blob store directory is writable. */
  storageWritable(): Promise<boolean>;
}
