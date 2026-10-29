/**
 * BuildEvidenceBundleUseCase (spec 150)
 *
 * Gathers what one feature run left behind into the evidence files every
 * improver stage reads: the request, how the run went (gate rejections, CI
 * fixes, repairs, errors), per-phase cost and turns, the agent's own session
 * transcripts from the run's worktree, and the scope's lesson library.
 * Deterministic for the same records.
 */

import { inject, injectable } from 'tsyringe';
import { LearnedHarnessStatus, type AgentSession } from '../../../domain/generated/output.js';
import type { IFeatureRepository } from '../../ports/output/repositories/feature-repository.interface.js';
import type { IPhaseTimingRepository } from '../../ports/output/agents/phase-timing-repository.interface.js';
import type { IAgentSessionRepositoryRegistry } from '../../ports/output/agents/agent-session-repository-registry.interface.js';
import type {
  HarnessScopeKey,
  ILearnedHarnessRepository,
} from '../../ports/output/repositories/learned-harness-repository.interface.js';
import type { EvidenceFiles } from '../../ports/output/services/evidence-workspace.interface.js';
import {
  MAX_TRAJECTORIES,
  assertEvidenceAllowed,
  renderLibrary,
  renderPhases,
  renderSignals,
  renderTask,
  renderTrajectory,
} from './evidence-render.js';
import type { ReflectOnFeatureRunInput } from './reflection.types.js';
import { SelectHarnessLessonsUseCase } from './select-harness-lessons.use-case.js';

/** Recent rejected candidates shown so the improver does not propose them again. */
const MAX_REJECTED_SHOWN = 5;

@injectable()
export class BuildEvidenceBundleUseCase {
  constructor(
    @inject('IFeatureRepository') private readonly features: IFeatureRepository,
    @inject('IPhaseTimingRepository') private readonly timings: IPhaseTimingRepository,
    @inject('IAgentSessionRepositoryRegistry')
    private readonly sessions: IAgentSessionRepositoryRegistry,
    @inject('ILearnedHarnessRepository') private readonly harnesses: ILearnedHarnessRepository,
    @inject(SelectHarnessLessonsUseCase) private readonly selectLessons: SelectHarnessLessonsUseCase
  ) {}

  async execute(input: ReflectOnFeatureRunInput, scope: HarnessScopeKey): Promise<EvidenceFiles> {
    const feature = await this.features.findById(input.featureId);
    const files: EvidenceFiles = {
      'task.md': renderTask(feature ?? { name: input.featureId, description: '', userQuery: '' }),
      'run/signals.md': renderSignals(input.signals),
      'run/phases.md': renderPhases(await this.timings.findByFeatureId(input.featureId)),
    };

    const trajectories = await this.loadTrajectories(input);
    trajectories.forEach((session, i) => {
      files[`trajectories/${String(i + 1).padStart(2, '0')}-${session.id}.md`] =
        renderTrajectory(session);
    });

    const [lessons, versions] = await Promise.all([
      this.selectLessons.execute(
        scope,
        [feature?.name, feature?.userQuery, feature?.description].filter(Boolean).join(' ')
      ),
      this.harnesses.listVersions(input.repositoryPath),
    ]);
    const rejected = versions
      .filter((v) => v.status === LearnedHarnessStatus.Rejected)
      .slice(0, MAX_REJECTED_SHOWN);
    files['library/INDEX.md'] = renderLibrary(lessons, rejected);

    assertEvidenceAllowed(files);
    return files;
  }

  /** The run's agent sessions, oldest first. Best-effort: none when transcripts are unreadable. */
  private async loadTrajectories(input: ReflectOnFeatureRunInput): Promise<AgentSession[]> {
    try {
      const repo = this.sessions.getRepository(input.agentType);
      const listed = await repo.list({ projectPath: input.worktreePath, limit: MAX_TRAJECTORIES });
      const full = await Promise.all(listed.map((s) => repo.findById(s.id, { messageLimit: 0 })));
      return full
        .filter((s): s is AgentSession => s !== null)
        .sort(
          (a, b) =>
            new Date(a.firstMessageAt ?? 0).getTime() - new Date(b.firstMessageAt ?? 0).getTime()
        );
    } catch {
      return [];
    }
  }
}
