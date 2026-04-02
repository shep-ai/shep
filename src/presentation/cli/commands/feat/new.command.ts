/**
 * Feature New Command
 *
 * Creates a new feature with a git branch and worktree.
 *
 * Usage: shep feat new <description> [options]
 *
 * @example
 * $ shep feat new "Add user authentication"
 * $ shep feat new "Add login page" --repo /path/to/project
 */

import { Command } from 'commander';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { container } from '@/infrastructure/di/container.js';
import { CreateFeatureUseCase } from '@/application/use-cases/features/create/create-feature.use-case.js';
import type { ApprovalGates } from '@/domain/generated/output.js';
import { SdlcLifecycle, FeatureMode } from '@/domain/generated/output.js';
import type { IFeatureRepository } from '@/application/ports/output/repositories/feature-repository.interface.js';
import { colors, messages, spinner } from '../../ui/index.js';
import { getCliI18n } from '../../i18n.js';
import { getShepHomeDir } from '@/infrastructure/services/filesystem/shep-directory.service.js';
import { getSettings, hasSettings } from '@/infrastructure/services/settings.service.js';
import { CheckOnboardingStatusUseCase } from '@/application/use-cases/settings/check-onboarding-status.use-case.js';
import { onboardingWizard } from '../../../tui/wizards/onboarding/onboarding.wizard.js';

interface NewOptions {
  repo?: string;
  push?: boolean;
  pr?: boolean;
  allowPrd?: boolean;
  allowPlan?: boolean;
  allowMerge?: boolean;
  allowAll?: boolean;
  parent?: string;
  fast?: boolean;
  explore?: boolean;
  pending?: boolean;
  model?: string;
  attach?: string[];
  rebase?: boolean;
  injectSkills?: boolean;
}

/** Commander collect pattern for repeatable options. */
function collect(value: string, previous: string[]): string[] {
  return [...previous, value];
}

/**
 * Read workflow defaults from settings, falling back to false if settings unavailable.
 */
interface WorkflowDefaults {
  openPr: boolean;
  allowPrd: boolean;
  allowPlan: boolean;
  allowMerge: boolean;
  push: boolean;
  defaultMode: FeatureMode;
}

function getWorkflowDefaults(): WorkflowDefaults {
  if (!hasSettings()) {
    return {
      openPr: false,
      allowPrd: false,
      allowPlan: false,
      allowMerge: false,
      push: false,
      defaultMode: FeatureMode.Fast,
    };
  }
  const settings = getSettings();
  const gates = settings.workflow.approvalGateDefaults;
  return {
    openPr: settings.workflow.openPrOnImplementationComplete,
    allowPrd: gates.allowPrd,
    allowPlan: gates.allowPlan,
    allowMerge: gates.allowMerge,
    push: gates.pushOnImplementationComplete,
    defaultMode: (settings.workflow.defaultMode as FeatureMode) ?? FeatureMode.Fast,
  };
}

/**
 * Create the feat new command
 */
export function createNewCommand(): Command {
  const t = getCliI18n().t;
  return new Command('new')
    .description(t('cli:commands.feat.new.description'))
    .argument('<description>', t('cli:commands.feat.new.descriptionArgument'))
    .option('-r, --repo <path>', t('cli:commands.feat.new.repoOption'))
    .option('--push', t('cli:commands.feat.new.pushOption'))
    .option('--pr', t('cli:commands.feat.new.prOption'))
    .option('--no-pr', t('cli:commands.feat.new.noPrOption'))
    .option('--allow-prd', t('cli:commands.feat.new.allowPrdOption'))
    .option('--allow-plan', t('cli:commands.feat.new.allowPlanOption'))
    .option('--allow-merge', t('cli:commands.feat.new.allowMergeOption'))
    .option('--allow-all', t('cli:commands.feat.new.allowAllOption'))
    .option('--parent <fid>', t('cli:commands.feat.new.parentOption'))
    .option('--pending', t('cli:commands.feat.new.pendingOption'))
    .option('--fast', t('cli:commands.feat.new.fastOption'))
    .option('--no-fast', t('cli:commands.feat.new.noFastOption'))
    .option('--explore', t('cli:commands.feat.new.exploreOption'))
    .option('--model <model>', t('cli:commands.feat.new.modelOption'))
    .option('--no-rebase', t('cli:commands.feat.new.noRebaseOption'))
    .option('--inject-skills', t('cli:commands.feat.new.injectSkillsOption'))
    .option('--no-inject-skills', t('cli:commands.feat.new.noInjectSkillsOption'))
    .option('--attach <path>', t('cli:commands.feat.new.attachOption'), collect, [])
    .action(async (description: string, options: NewOptions) => {
      try {
        // First-run onboarding gate — only for interactive terminals
        if (process.stdin.isTTY) {
          const { isComplete } = await new CheckOnboardingStatusUseCase().execute();
          if (!isComplete) {
            await onboardingWizard();
          }
        }

        const useCase = container.resolve(CreateFeatureUseCase);
        const repoPath = options.repo ?? process.cwd();

        // Resolve openPr from CLI flags or settings defaults
        const defaults = getWorkflowDefaults();
        const openPr = options.pr ?? defaults.openPr;

        // Build approval gates from flags, falling back to settings defaults
        const approvalGates: ApprovalGates = options.allowAll
          ? { allowPrd: true, allowPlan: true, allowMerge: true }
          : {
              allowPrd: options.allowPrd ?? defaults.allowPrd,
              allowPlan: options.allowPlan ?? defaults.allowPlan,
              allowMerge: options.allowMerge ?? defaults.allowMerge,
            };

        const push = options.push ?? defaults.push;

        // Resolve parent feature ID if --parent flag is provided
        let parentId: string | undefined;
        if (options.parent) {
          const featureRepo = container.resolve<IFeatureRepository>('IFeatureRepository');
          const parentFeature = await featureRepo.findByIdPrefix(options.parent);
          if (!parentFeature) {
            messages.error(t('cli:commands.feat.new.parentNotFound', { id: options.parent }));
            process.exitCode = 1;
            return;
          }
          parentId = parentFeature.id;
        }

        // Validate --attach paths
        const attachmentPaths: string[] = [];
        if (options.attach && options.attach.length > 0) {
          for (const raw of options.attach) {
            const resolved = resolve(raw);
            if (!existsSync(resolved)) {
              messages.error(t('cli:commands.feat.new.attachmentNotFound', { path: resolved }));
              process.exitCode = 1;
              return;
            }
            attachmentPaths.push(resolved);
          }
        }

        // Validate mutually exclusive mode flags
        if (options.explore && options.fast) {
          messages.error(t('cli:commands.feat.new.exploreAndFastConflict'));
          process.exitCode = 1;
          return;
        }

        const mode = options.explore
          ? FeatureMode.Exploration
          : options.fast
            ? FeatureMode.Fast
            : options.fast === false
              ? FeatureMode.Regular
              : defaults.defaultMode;

        const result = await spinner(t('cli:commands.feat.new.spinnerText'), () =>
          useCase.execute({
            userInput: description,
            repositoryPath: repoPath,
            approvalGates,
            push,
            openPr,
            ...(parentId !== undefined && { parentId }),
            ...(options.pending && { pending: true }),
            mode,
            ...(options.model !== undefined && { model: options.model }),
            ...(attachmentPaths.length > 0 && { attachmentPaths }),
            ...(options.injectSkills !== undefined && { injectSkills: options.injectSkills }),
            rebaseBeforeBranch: options.rebase,
          })
        );

        const { feature, warning } = result;
        const repoHash = createHash('sha256').update(repoPath).digest('hex').slice(0, 16);
        const wtSlug = feature.branch.replace(/\//g, '-');
        const worktreePath = join(getShepHomeDir(), 'repos', repoHash, 'wt', wtSlug);

        messages.newline();
        if (warning) {
          messages.warning(warning);
        }
        messages.success(t('cli:commands.feat.new.featureCreated'));
        if (feature.lifecycle === SdlcLifecycle.Blocked) {
          messages.info(t('cli:commands.feat.new.blockedInfo'));
        }
        if (feature.lifecycle === SdlcLifecycle.Pending) {
          messages.info(
            t('cli:commands.feat.new.pendingInfo', {
              command: colors.accent(`shep feat start ${feature.id.slice(0, 8)}`),
            })
          );
        }
        console.log(
          `  ${colors.muted(t('cli:commands.feat.new.idLabel'))}       ${colors.accent(feature.id)}`
        );
        console.log(`  ${colors.muted(t('cli:commands.feat.new.nameLabel'))}     ${feature.name}`);
        console.log(
          `  ${colors.muted(t('cli:commands.feat.new.branchLabel'))}   ${colors.accent(feature.branch)}`
        );
        console.log(
          `  ${colors.muted(t('cli:commands.feat.new.statusLabel'))}   ${feature.lifecycle}`
        );
        console.log(`  ${colors.muted(t('cli:commands.feat.new.worktreeLabel'))} ${worktreePath}`);
        if (feature.specPath) {
          console.log(
            `  ${colors.muted(t('cli:commands.feat.new.specLabel'))}     ${feature.specPath}`
          );
        }
        if (feature.agentRunId) {
          const agentStatus =
            feature.lifecycle === SdlcLifecycle.Pending
              ? colors.muted(t('cli:commands.feat.new.pendingStatus'))
              : colors.success(t('cli:commands.feat.new.spawnedStatus'));
          console.log(
            `  ${colors.muted(t('cli:commands.feat.new.agentLabel'))}    ${agentStatus} (run ${feature.agentRunId.slice(0, 8)})`
          );
        }
        if (push || openPr) {
          const pushHint = openPr
            ? t('cli:commands.feat.new.pushPr')
            : t('cli:commands.feat.new.pushOnly');
          console.log(`  ${colors.muted(t('cli:commands.feat.new.pushLabel'))}     ${pushHint}`);
        }
        const approved = [
          approvalGates.allowPrd && 'PRD',
          approvalGates.allowPlan && 'Plan',
          approvalGates.allowMerge && 'Merge',
        ].filter(Boolean);
        const hint =
          approved.length === 3
            ? t('cli:commands.feat.new.fullyAutonomous')
            : approved.length === 0
              ? t('cli:commands.feat.new.pauseAfterEvery')
              : t('cli:commands.feat.new.autoApprove', { approved: approved.join(', ') });
        console.log(`  ${colors.muted(t('cli:commands.feat.new.reviewLabel'))}   ${hint}`);
        messages.newline();
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        messages.error(t('cli:commands.feat.new.failedToCreate'), err);
        process.exitCode = 1;
      }
    });
}
