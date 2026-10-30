/**
 * LearnedHarnessRunSession (spec 150) — the learned harness of ONE feature run.
 *
 * The adopted version is resolved once and pinned for the run, so every agent
 * call of the run uses the same version and the run's outcome is attributed to
 * exactly that version. `prepare` installs it into a working directory before
 * each call (re-installing is cheap and restores anything the agent deleted).
 */

import type { AgentType, LearnedHarnessVersion } from '../../../domain/generated/output.js';
import type {
  HarnessInstallation,
  IHarnessInstaller,
} from '../../../application/ports/output/services/harness-installer.interface.js';
import type { GetCurrentHarnessUseCase } from '../../../application/use-cases/harness-learning/get-current-harness.use-case.js';

export type HarnessLog = (message: string) => void;

export class LearnedHarnessRunSession {
  private pinned?: Promise<LearnedHarnessVersion | null>;

  constructor(
    private readonly getCurrent: Pick<GetCurrentHarnessUseCase, 'execute'>,
    private readonly installer: IHarnessInstaller,
    private readonly repositoryPath: string,
    private readonly log: HarnessLog
  ) {}

  /** The version this run uses (resolved on first use), or null for none. */
  version(): Promise<LearnedHarnessVersion | null> {
    this.pinned ??= Promise.resolve()
      .then(() => this.getCurrent.execute({ repositoryPath: this.repositoryPath }))
      .catch((error: unknown) => {
        this.log(`[learned-harness] could not load the adopted version: ${String(error)}`);
        return null;
      });
    return this.pinned;
  }

  async versionId(): Promise<string | undefined> {
    return (await this.version())?.id;
  }

  /** Install the pinned version for one call; null when there is nothing to install. */
  async prepare(agentType: AgentType, worktreePath: string): Promise<HarnessInstallation | null> {
    const version = await this.version();
    if (!version || version.components.length === 0) return null;
    const installation = await this.installer.install({ version, agentType, worktreePath });
    for (const warning of installation.warnings) this.log(`[learned-harness] ${warning}`);
    return installation;
  }
}
