/**
 * Override Dev Server Run Plan Use Case
 *
 * Persists a user-authored plan as `RunPlanSource.Manual` — the one predicate
 * the analyze node and the remediate node both branch on, so a typed command
 * survives config drift and start failures instead of being silently replaced.
 *
 * The override is SEEDED from the currently resolved plan, so the user changes
 * only what they meant to change: sending just a `command` keeps the detected
 * cwd, package manager, port and setup commands. Passing `null` for an
 * optional field clears it; omitting it keeps whatever was there.
 *
 * All validation lives here, never in a presentation layer (FR-19):
 * - `command` non-empty after trimming,
 * - `cwd` inside the target's `repoPath` subtree AND existing on disk,
 * - `expectedPort`, when supplied, an integer in 1–65535.
 *
 * And one refusal that is not validation: when a committed `.shep/dev.json`
 * controls the repository, that file is re-read on every start and outranks
 * anything stored, so writing a row here would be a silent no-op on typed
 * input. The use case says so instead.
 *
 * Security posture (NFR-6): the command is executed verbatim through the same
 * spawn path as an agent-inferred or package.json command — no new capability.
 * The controls that matter are the ones that prevent accidents: a non-empty
 * command and a `cwd` that cannot escape the repository.
 */

import { posix } from 'node:path';
import { inject, injectable } from 'tsyringe';

import { RunPlanSource, type DevServerRunPlan } from '../../../domain/generated/output.js';
import { isAbsolutePath } from '../../../domain/shared/absolute-path.js';
import { normalizePath } from '../../../domain/shared/normalize-path.js';
import { isPathInside } from '../../../domain/shared/path-confinement.js';
import { isValidPort, PORT_MAX, PORT_MIN } from '../../../domain/shared/port-range.js';
import type { IDevServerRunPlanRepository } from '../../ports/output/repositories/dev-server-run-plan-repository.interface.js';
import type { IFileSystemService } from '../../ports/output/services/file-system-service.interface.js';
import type { IRunPlanStalenessProbe } from '../../ports/output/services/run-plan-staleness-probe.interface.js';
import {
  DeploymentTargetResolutionStatus,
  DeploymentTargetResolver,
  type DeploymentTargetRef,
} from '../../services/deployment-target-resolver.js';
import {
  DevServerRunPlanStatus,
  REPO_CONFIG_CONTROLLED_NOTICE,
  toRunPlanView,
  toTargetFailure,
  type DevServerRunPlanTargetFailure,
  type DevServerRunPlanView,
} from './dev-server-run-plan-results.js';

/** Fields an override can be rejected on. */
export enum RunPlanOverrideField {
  Command = 'command',
  Cwd = 'cwd',
  ExpectedPort = 'expectedPort',
}

export interface RunPlanOverrideValidationError {
  field: RunPlanOverrideField;
  message: string;
}

/**
 * Every optional field follows the same three-way convention:
 * omitted = keep the seeded value, `null` = clear it, a value = set it.
 */
export interface OverrideDevServerRunPlanInput extends DeploymentTargetRef {
  command?: string;
  /** Absolute, or relative to the target's repository root. */
  cwd?: string;
  expectedPort?: number | null;
  language?: string | null;
  framework?: string | null;
  packageManager?: string | null;
  setupCommands?: string[];
}

export type OverrideDevServerRunPlanResult =
  | { status: DevServerRunPlanStatus.Ok; repoPath: string; plan: DevServerRunPlanView }
  | { status: DevServerRunPlanStatus.RepoConfigControlled; repoPath: string; message: string }
  | {
      status: DevServerRunPlanStatus.ValidationFailed;
      errors: RunPlanOverrideValidationError[];
    }
  | DevServerRunPlanTargetFailure;

@injectable()
export class OverrideDevServerRunPlanUseCase {
  constructor(
    private readonly targetResolver: DeploymentTargetResolver,
    @inject('IDevServerRunPlanRepository')
    private readonly runPlanRepository: IDevServerRunPlanRepository,
    @inject('IRunPlanStalenessProbe')
    private readonly stalenessProbe: IRunPlanStalenessProbe,
    @inject('IFileSystemService')
    private readonly fileSystem: IFileSystemService
  ) {}

  async execute(input: OverrideDevServerRunPlanInput): Promise<OverrideDevServerRunPlanResult> {
    const resolution = await this.targetResolver.resolve(input);
    if (resolution.status !== DeploymentTargetResolutionStatus.Resolved) {
      return toTargetFailure(resolution);
    }

    const { repoPath } = resolution.target;

    // Refused before validation: there is nothing to validate if the write
    // could never take effect.
    if (this.stalenessProbe.hasRepoDevConfig(repoPath)) {
      return {
        status: DevServerRunPlanStatus.RepoConfigControlled,
        repoPath,
        message: REPO_CONFIG_CONTROLLED_NOTICE,
      };
    }

    const existing = await this.runPlanRepository.findByRepoPath(repoPath);
    const command = (input.command ?? existing?.command ?? '').trim();
    const cwd = this.resolveCwd(repoPath, input.cwd ?? existing?.cwd);
    const expectedPort = pick(input.expectedPort, existing?.expectedPort);

    const errors = this.validate({ repoPath, command, cwd, expectedPort });
    if (errors.length > 0) {
      return { status: DevServerRunPlanStatus.ValidationFailed, errors };
    }

    const now = new Date();
    const plan: DevServerRunPlan = {
      repoPath,
      source: RunPlanSource.Manual,
      command,
      cwd,
      setupCommands: input.setupCommands ?? existing?.setupCommands ?? [],
      configHash: this.stalenessProbe.currentConfigHash(repoPath),
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      ...defined('expectedPort', expectedPort),
      ...defined('language', pick(input.language, existing?.language)),
      ...defined('framework', pick(input.framework, existing?.framework)),
      ...defined('packageManager', pick(input.packageManager, existing?.packageManager)),
      // Carried forward so a command change does not force a full reinstall.
      ...defined('installStampHash', existing?.installStampHash),
    };

    await this.runPlanRepository.upsert(plan);
    // Freshly stamped with the current hash, so it cannot be stale yet.
    return { status: DevServerRunPlanStatus.Ok, repoPath, plan: toRunPlanView(plan, false) };
  }

  /**
   * Resolve a declared cwd to an absolute, forward-slash path.
   *
   * Deliberately string-lexical (`posix.normalize` over normalized input)
   * rather than `path.resolve`: on Windows, `resolve('/workspaces/acme', …)`
   * silently prepends the current drive letter, which would make a POSIX-style
   * repository path resolve somewhere else entirely.
   */
  private resolveCwd(repoPath: string, declared: string | undefined): string {
    if (declared === undefined || declared.trim() === '') return repoPath;

    const candidate = normalizePath(declared.trim());
    const combined = isAbsolutePath(candidate) ? candidate : `${repoPath}/${candidate}`;
    return normalizePath(posix.normalize(combined));
  }

  private validate(candidate: {
    repoPath: string;
    command: string;
    cwd: string;
    expectedPort: number | undefined;
  }): RunPlanOverrideValidationError[] {
    const errors: RunPlanOverrideValidationError[] = [];

    if (candidate.command === '') {
      errors.push({
        field: RunPlanOverrideField.Command,
        message: 'A dev server command is required.',
      });
    }

    if (!isPathInside(candidate.repoPath, candidate.cwd)) {
      errors.push({
        field: RunPlanOverrideField.Cwd,
        message: `The working directory must be inside ${candidate.repoPath}.`,
      });
    } else if (!this.fileSystem.pathExists(candidate.cwd)) {
      errors.push({
        field: RunPlanOverrideField.Cwd,
        message: `The working directory does not exist: ${candidate.cwd}`,
      });
    }

    if (candidate.expectedPort !== undefined && !isValidPort(candidate.expectedPort)) {
      errors.push({
        field: RunPlanOverrideField.ExpectedPort,
        message: `The expected port must be a whole number between ${PORT_MIN} and ${PORT_MAX}.`,
      });
    }

    return errors;
  }
}

/** Omitted keeps the seeded value; `null` clears it; a value sets it. */
function pick<T>(supplied: T | null | undefined, seeded: T | undefined): T | undefined {
  if (supplied === undefined) return seeded;
  // An explicit null means "clear this", which the plan expresses as absence.
  return supplied ?? undefined;
}

/** Spread helper that omits a key entirely when its value is absent. */
function defined<K extends string, V>(key: K, value: V | undefined): Record<K, V> | object {
  return value === undefined ? {} : ({ [key]: value } as Record<K, V>);
}
