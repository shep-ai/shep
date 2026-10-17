/**
 * Agent-owned, bounded coordination of two simultaneously active feature workcells.
 *
 * Not a generic scheduler. The witness is committed Git path overlap between
 * independent S1 workcells; the model owns the defer/continue choice while the
 * existing ReparentFeatureUseCase owns lifecycle enforcement.
 *
 * Opt-in through the `agentCoordination` feature flag, read on every call so
 * toggling it in Settings takes effect without a restart. The applied decision
 * is stored on the designated dependent (`Feature.coordination`) so every
 * surface can show why an edge exists — or why two overlapping features were
 * allowed to keep running.
 */
import { injectable, inject } from 'tsyringe';
import {
  CoordinationAction,
  CoordinationOutcome,
  SdlcLifecycle,
  type Feature,
  type FeatureCoordination,
} from '../../../domain/generated/output.js';
import { satisfiesDependencyGate } from '../../../domain/lifecycle-gates.js';
import type { IFeatureRepository } from '../../ports/output/repositories/feature-repository.interface.js';
import type {
  IGitPrService,
  FileDiff,
} from '../../ports/output/services/git-pr-service.interface.js';
import type { IWorktreeService } from '../../ports/output/services/worktree-service.interface.js';
import type { IAgentExecutorProvider } from '../../ports/output/agents/agent-executor-provider.interface.js';
import type { ISettingsRepository } from '../../ports/output/repositories/settings.repository.interface.js';
import { ReparentFeatureUseCase } from './reparent-feature.use-case.js';
import { buildCoordinationPrompt, parseCoordinationAnswer } from './coordination-prompt.js';

interface Collision {
  peer: Feature;
  paths: string[];
}

interface Evidence {
  source: Feature;
  collision: Collision;
  fingerprint: string;
}

const ELIGIBLE = new Set<SdlcLifecycle>([SdlcLifecycle.Implementation, SdlcLifecycle.Review]);
const MAX_PEERS = 8;
const MAX_PATHS = 24;
const DECISION_TIMEOUT_MS = 30_000;

/** Lexically greater id waits for the lesser one, whichever feature asks. */
function orient(a: Feature, b: Feature): { dependent: Feature; prerequisite: Feature } {
  return a.id > b.id ? { dependent: a, prerequisite: b } : { dependent: b, prerequisite: a };
}

function changedPaths(diffs: FileDiff[]): string[] {
  return [
    ...new Set(
      diffs.flatMap((diff) =>
        [diff.path, diff.oldPath].filter((p): p is string => typeof p === 'string' && p.length > 0)
      )
    ),
  ].sort();
}

@injectable()
export class CoordinateFeatureConflictsUseCase {
  constructor(
    @inject('IFeatureRepository') private readonly features: IFeatureRepository,
    @inject('IGitPrService') private readonly git: IGitPrService,
    @inject('IWorktreeService') private readonly worktrees: IWorktreeService,
    @inject('IAgentExecutorProvider') private readonly agentProvider: IAgentExecutorProvider,
    @inject(ReparentFeatureUseCase) private readonly reparent: ReparentFeatureUseCase,
    @inject('ISettingsRepository') private readonly settings: ISettingsRepository
  ) {}

  async execute(featureId: string): Promise<CoordinationOutcome> {
    const settings = await this.settings.load();
    if (settings?.featureFlags?.agentCoordination !== true) return CoordinationOutcome.Disabled;

    const evidence = await this.observe(featureId);
    if (evidence === 'unavailable') return CoordinationOutcome.Unavailable;
    if (!evidence) return CoordinationOutcome.NoConflict;

    const { source, collision } = evidence;
    // Total order prevents two concurrent coordinators creating opposite edges.
    // The agent still owns whether coordination is warranted, not the edge orientation.
    const { dependent, prerequisite } = orient(source, collision.peer);
    const prompt = buildCoordinationPrompt({
      source,
      peer: collision.peer,
      dependent,
      prerequisite,
      paths: collision.paths,
    });

    let raw: string;
    try {
      const executor = await this.agentProvider.getExecutor();
      const result = await executor.execute(prompt, {
        cwd: source.repositoryPath,
        maxTurns: 1,
        timeout: DECISION_TIMEOUT_MS,
        silent: true,
        disableMcp: true,
        tools: [],
        allowedTools: [],
      });
      raw = result.result;
    } catch {
      return CoordinationOutcome.Unavailable;
    }

    const decision = parseCoordinationAnswer(raw);
    if (!decision) return CoordinationOutcome.Unavailable;

    // A model response is NEVER an unconditional write. Re-read the affected
    // source and peer, branch diffs and HEADs before applying its judgment.
    const current = await this.observe(featureId);
    if (!current || current === 'unavailable' || current.fingerprint !== evidence.fingerprint)
      return CoordinationOutcome.Stale;

    const fresh = orient(current.source, current.collision.peer);
    const coordination: FeatureCoordination = {
      action: decision.action,
      rationale: decision.rationale,
      peerFeatureId: fresh.prerequisite.id,
      overlappingPaths: current.collision.paths,
      decidedAt: new Date(),
    };

    if (decision.action === CoordinationAction.Continue) {
      // Record the judgment so the user can see why overlapping work runs on.
      await this.features.update({ ...fresh.dependent, coordination, updatedAt: new Date() });
      return CoordinationOutcome.Continued;
    }

    // A completed prerequisite does not justify withholding a still-running peer.
    if (satisfiesDependencyGate(fresh.prerequisite)) return CoordinationOutcome.Stale;

    // Existing use case handles cycle checks, same-repo checks, worker stop,
    // write-side dependency gates, and rebase/resume on parent progress. The
    // decision is written in the same update as the edge it explains.
    // Reparent remains non-transactional against external concurrent writers.
    await this.reparent.execute({
      featureId: fresh.dependent.id,
      parentId: fresh.prerequisite.id,
      coordination,
    });
    return CoordinationOutcome.Deferred;
  }

  private async observe(featureId: string): Promise<Evidence | 'unavailable' | null> {
    const source = await this.features.findById(featureId);
    if (!source || source.deletedAt || source.parentId || !ELIGIBLE.has(source.lifecycle)) {
      return null;
    }

    const peers = (await this.features.list({ repositoryPath: source.repositoryPath })).filter(
      (feature) =>
        feature.id !== source.id &&
        !feature.deletedAt &&
        !feature.parentId &&
        feature.branch !== source.branch &&
        ELIGIBLE.has(feature.lifecycle)
    );

    // Do not let a partial sample or ambiguous multi-peer collision become a
    // guessed ordering. A later version can model a full conflict graph.
    if (peers.length === 0) return null;
    if (peers.length > MAX_PEERS) return 'unavailable';

    try {
      const base = await this.git.getDefaultBranch(source.repositoryPath);
      const baseHead = await this.git.revParse(source.repositoryPath, base);
      const all = [source, ...peers];
      const observations: { feature: Feature; head: string; paths: string[] }[] = [];
      for (const feature of all) {
        if (!(await this.worktrees.exists(feature.repositoryPath, feature.branch))) {
          return 'unavailable';
        }
        const cwd = this.worktrees.getWorktreePath(feature.repositoryPath, feature.branch);
        // The path-only witness covers committed changes, never uncommitted edits.
        // Refuse a potentially incomplete view instead of authorizing a dependency.
        const [head, diffs, dirty] = await Promise.all([
          this.git.revParse(cwd, 'HEAD'),
          this.git.getFileDiffs(cwd, base),
          this.git.hasUncommittedChanges(cwd),
        ]);
        if (dirty) return 'unavailable';
        observations.push({ feature, head, paths: changedPaths(diffs) });
      }

      const ownPaths = new Set(observations[0].paths);
      const collisions = observations
        .slice(1)
        .map((entry) => ({
          peer: entry.feature,
          paths: entry.paths.filter((path) => ownPaths.has(path)),
        }))
        .filter((entry) => entry.paths.length > 0);

      if (collisions.length === 0) return null;
      if (collisions.length !== 1 || collisions[0].paths.length > MAX_PATHS) {
        return 'unavailable';
      }

      // A moving merge base makes the changed-path comparison stale even if
      // both feature HEADs happen to stay unchanged.
      if ((await this.git.revParse(source.repositoryPath, base)) !== baseHead) {
        return 'unavailable';
      }
      const fingerprint = JSON.stringify({
        baseHead,
        observations: observations.map((entry) => ({
          id: entry.feature.id,
          lifecycle: entry.feature.lifecycle,
          parentId: entry.feature.parentId ?? null,
          head: entry.head,
          paths: entry.paths,
        })),
      });
      return { source, collision: collisions[0], fingerprint };
    } catch {
      // No git evidence is not permission to guess about possible interference.
      return 'unavailable';
    }
  }
}
