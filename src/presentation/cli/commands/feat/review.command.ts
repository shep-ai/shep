/**
 * Feature Review Command
 *
 * Interactive review of a feature waiting for approval.
 * Routes to phase-specific TUI wizard (PRD, Plan, or Merge),
 * then calls approve or reject use case based on user action.
 *
 * Usage:
 *   shep feat review [id]
 */

import { Command } from 'commander';
import { container } from '@/infrastructure/di/container.js';
import type { IFeatureRepository } from '@/application/ports/output/repositories/feature-repository.interface.js';
import type { IAgentRunRepository } from '@/application/ports/output/agents/agent-run-repository.interface.js';
import { ReviewFeatureUseCase } from '@/application/use-cases/agents/review-feature.use-case.js';
import { ApproveAgentRunUseCase } from '@/application/use-cases/agents/approve-agent-run.use-case.js';
import { RejectAgentRunUseCase } from '@/application/use-cases/agents/reject-agent-run.use-case.js';
import { resolveWaitingFeature } from './resolve-waiting-feature.js';
import { prdReviewWizard } from '../../../tui/wizards/prd-review.wizard.js';
import { planReviewWizard } from '../../../tui/wizards/plan-review.wizard.js';
import { mergeReviewWizard } from '../../../tui/wizards/merge-review.wizard.js';
import { colors, messages } from '../../ui/index.js';
import { getCliI18n } from '../../i18n.js';

type ReviewAction = 'approve' | 'reject';

interface WizardResult {
  action: ReviewAction;
  changedSelections?: { questionId: string; selectedOption: string }[];
  feedback?: string;
}

function parsePhase(runResult?: string | null): string {
  return runResult?.startsWith('node:') ? runResult.slice(5) : 'unknown';
}

async function runPhaseWizard(
  phase: string,
  featureId: string,
  repoPath: string
): Promise<WizardResult> {
  if (phase === 'requirements') {
    const reviewUseCase = container.resolve(ReviewFeatureUseCase);
    const reviewResult = await reviewUseCase.execute(featureId, repoPath);
    if (!reviewResult.success) {
      throw new Error(reviewResult.reason);
    }
    return prdReviewWizard(reviewResult.questions);
  }

  if (phase === 'plan') {
    const result = await planReviewWizard();
    return { action: result.action, feedback: result.feedback };
  }

  if (phase === 'merge') {
    const result = await mergeReviewWizard();
    return { action: result.action, feedback: result.feedback };
  }

  throw new Error(`Unknown approval phase: ${phase}`);
}

function phaseNextStep(phase: string): string {
  switch (phase) {
    case 'requirements':
      return 'research';
    case 'plan':
      return 'implementation';
    case 'merge':
      return 'merge';
    default:
      return 'next step';
  }
}

export function createReviewCommand(): Command {
  const t = getCliI18n().t;
  return new Command('review')
    .description(t('cli:commands.feat.review.description'))
    .addHelpText(
      'after',
      `
Examples:
  $ shep feat review              Auto-pick the single waiting feature
  $ shep feat review feat-123     Review a specific feature by id`
    )
    .argument('[id]', t('cli:commands.feat.review.idArgument'))
    .action(async (featureId?: string) => {
      try {
        const featureRepo = container.resolve<IFeatureRepository>('IFeatureRepository');
        const runRepo = container.resolve<IAgentRunRepository>('IAgentRunRepository');
        const repoPath = process.cwd();

        const { feature, run } = await resolveWaitingFeature({
          featureId,
          repoPath,
          featureRepo,
          runRepo,
        });

        const phase = parsePhase(run.result);

        messages.newline();
        messages.info(
          t('cli:commands.feat.review.reviewing', { name: colors.accent(feature.name) })
        );
        console.log(
          `  ${colors.muted(t('cli:commands.feat.review.phaseLabel'))}  ${colors.warning(phase)}`
        );
        console.log(
          `  ${colors.muted(t('cli:commands.feat.review.branchLabel'))} ${colors.accent(feature.branch)}`
        );
        messages.newline();

        const wizardResult = await runPhaseWizard(phase, feature.id, repoPath);

        if (wizardResult.action === 'approve') {
          const approveUseCase = container.resolve(ApproveAgentRunUseCase);
          const payload =
            wizardResult.changedSelections && wizardResult.changedSelections.length > 0
              ? { approved: true, changedSelections: wizardResult.changedSelections }
              : undefined;
          const approveResult = await approveUseCase.execute(run.id, payload);

          if (approveResult.approved) {
            messages.newline();
            messages.success(t('cli:commands.feat.review.approvedSuccess', { name: feature.name }));
            if (wizardResult.changedSelections && wizardResult.changedSelections.length > 0) {
              console.log(
                `  ${colors.muted(t('cli:commands.feat.review.changesLabel'))} ${t('cli:commands.feat.review.changesUpdated', { count: wizardResult.changedSelections.length })}`
              );
            }
            if (wizardResult.feedback) {
              console.log(
                `  ${colors.muted(t('cli:commands.feat.review.commentLabel'))} ${wizardResult.feedback}`
              );
            }
            console.log(
              `  ${colors.muted(t('cli:commands.feat.review.agentLabel'))}   ${t('cli:commands.feat.review.proceedingTo', { phase: phaseNextStep(phase) })}`
            );
            messages.newline();
          } else {
            throw new Error(approveResult.reason);
          }
        } else {
          const rejectUseCase = container.resolve(RejectAgentRunUseCase);
          const rejectResult = await rejectUseCase.execute(run.id, wizardResult.feedback!);

          if (rejectResult.rejected) {
            messages.newline();
            messages.warning(t('cli:commands.feat.review.rejectedWarning', { name: feature.name }));
            console.log(
              `  ${colors.muted(t('cli:commands.feat.review.feedbackLabel'))} ${wizardResult.feedback}`
            );
            console.log(
              `  ${colors.muted(t('cli:commands.feat.review.iterationLabel'))} ${rejectResult.iteration}`
            );
            if (rejectResult.iterationWarning) {
              messages.warning(t('cli:commands.feat.review.iterationWarning'));
            }
            console.log(
              `  ${colors.muted(t('cli:commands.feat.review.agentLabel'))}    ${t('cli:commands.feat.review.agentRerunning', { phase })}`
            );
            messages.newline();
          } else {
            throw new Error(rejectResult.reason);
          }
        }
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        messages.error(t('cli:commands.feat.review.failedToReview'), err);
        process.exitCode = 1;
      }
    });
}
