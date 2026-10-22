/**
 * Approve Agent Run Use Case
 *
 * Approves a paused agent run (waiting_approval status) and
 * spawns a new resume worker to continue graph execution.
 * Optionally accepts a PrdApprovalPayload to update spec.yaml
 * selections before resuming.
 */

import { injectable, inject } from 'tsyringe';
import yaml from 'js-yaml';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { IAgentRunRepository } from '../../ports/output/agents/agent-run-repository.interface.js';
import type { IFeatureAgentProcessService } from '../../ports/output/agents/feature-agent-process.interface.js';
import type { IPhaseTimingRepository } from '../../ports/output/agents/phase-timing-repository.interface.js';
import type { IFeatureRepository } from '../../ports/output/repositories/feature-repository.interface.js';
import { AgentRunStatus } from '../../../domain/generated/output.js';
import type { PrdApprovalPayload } from '../../../domain/generated/output.js';
import { writeSpecFileAtomic } from '../../../infrastructure/services/agents/feature-agent/nodes/node-helpers.js';
import { computeWorktreePath } from '../../../infrastructure/services/ide-launchers/compute-worktree-path.js';

@injectable()
export class ApproveAgentRunUseCase {
  constructor(
    @inject('IAgentRunRepository')
    private readonly agentRunRepository: IAgentRunRepository,
    @inject('IFeatureAgentProcessService')
    private readonly processService: IFeatureAgentProcessService,
    @inject('IFeatureRepository')
    private readonly featureRepository: IFeatureRepository,
    @inject('IPhaseTimingRepository')
    private readonly phaseTimingRepository: IPhaseTimingRepository
  ) {}

  async execute(
    id: string,
    payload?: PrdApprovalPayload
  ): Promise<{ approved: boolean; reason: string }> {
    const run = await this.agentRunRepository.findById(id);
    if (!run) {
      return { approved: false, reason: 'Agent run not found' };
    }

    if (run.status !== AgentRunStatus.waitingApproval) {
      return {
        approved: false,
        reason: `Agent run is not waiting for approval (status: ${run.status})`,
      };
    }

    // Look up the feature to get specPath
    const feature = run.featureId ? await this.featureRepository.findById(run.featureId) : null;

    // Write updated selections to spec.yaml if changedSelections provided
    if (payload?.changedSelections && payload.changedSelections.length > 0 && feature?.specPath) {
      try {
        const specDir = feature.specPath;
        const specContent = readFileSync(join(specDir, 'spec.yaml'), 'utf-8');
        const spec = yaml.load(specContent) as Record<string, unknown>;

        if (Array.isArray(spec?.openQuestions)) {
          for (const change of payload.changedSelections) {
            const question = (spec.openQuestions as Record<string, unknown>[]).find(
              (q) => q.question === change.questionId
            );
            if (question && Array.isArray(question.options)) {
              for (const opt of question.options as Record<string, unknown>[]) {
                opt.selected = opt.option === change.selectedOption;
              }
              question.answer = change.selectedOption;
            }
          }
        }

        writeSpecFileAtomic(specDir, 'spec.yaml', yaml.dump(spec));
      } catch {
        // Non-fatal: selection update failure should not block approval
      }
    }

    const now = new Date();
    await this.agentRunRepository.updateStatus(id, AgentRunStatus.running, {
      updatedAt: now,
    });

    // Compute and record approval wait duration
    try {
      const timings = await this.phaseTimingRepository.findByRunId(id);
      const waitingTiming = timings.find((t) => t.waitingApprovalAt && !t.approvalWaitMs);
      if (waitingTiming) {
        const waitStart =
          waitingTiming.waitingApprovalAt instanceof Date
            ? waitingTiming.waitingApprovalAt.getTime()
            : Number(waitingTiming.waitingApprovalAt);
        const approvalWaitMs = BigInt(now.getTime() - waitStart);
        await this.phaseTimingRepository.updateApprovalWait(waitingTiming.id, {
          approvalWaitMs,
        });
      }
    } catch {
      // Non-fatal: approval wait timing failure should not block approval
    }

    // Derive worktree path with fallback — the mapper conditionally sets
    // worktreePath only when the DB column is non-null, so compute it if missing.
    const worktreePath =
      feature?.worktreePath ??
      (feature?.repositoryPath && feature?.branch
        ? computeWorktreePath(feature.repositoryPath, feature.branch)
        : undefined);

    this.processService.spawn(
      run.featureId ?? '',
      id,
      feature?.repositoryPath ?? run.repositoryPath ?? '',
      feature?.specPath ?? '',
      worktreePath,
      {
        resume: true,
        approvalGates: run.approvalGates,
        threadId: run.threadId,
        resumeFromInterrupt: true,
        push: feature?.push ?? false,
        openPr: feature?.openPr ?? false,
        ...(payload ? { resumePayload: JSON.stringify(payload) } : {}),
        agentType: run.agentType,
        ...(run.modelId ? { model: run.modelId } : {}),
        ...(feature?.fast ? { fast: true } : {}),
      }
    );

    return { approved: true, reason: 'Approved and resumed' };
  }
}
