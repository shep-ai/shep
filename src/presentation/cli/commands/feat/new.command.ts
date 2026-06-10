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
 * $ shep feat new "Add dark mode" --remote owner/repo
 */

import { Command } from 'commander';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { container } from '@/infrastructure/di/container.js';
import { CreateFeatureUseCase } from '@/application/use-cases/features/create/create-feature.use-case.js';
import { CreateFeatureFromRemoteUseCase } from '@/application/use-cases/features/create/create-feature-from-remote.use-case.js';
import type { ApprovalGates, Feature } from '@/domain/generated/output.js';
import { SdlcLifecycle, BuildMode } from '@/domain/generated/output.js';
import type { IFeatureRepository } from '@/application/ports/output/repositories/feature-repository.interface.js';
import {
  GitHubAuthError,
  GitHubCloneError,
  GitHubForkError,
  GitHubUrlParseError,
} from '@/application/ports/output/services/github-repository-service.interface.js';
import type { IRepositoryRepository } from '@/application/ports/output/repositories/repository-repository.interface.js';
import { colors, messages, spinner } from '../../ui/index.js';
import { getCliI18n } from '../../i18n.js';
import { getShepHomeDir } from '@/infrastructure/services/filesystem/shep-directory.service.js';
import { getSettings, hasSettings } from '@/infrastructure/services/settings.service.js';
import { CheckOnboardingStatusUseCase } from '@/application/use-cases/settings/check-onboarding-status.use-case.js';
import { onboardingWizard } from '../../../tui/wizards/onboarding/onboarding.wizard.js';

interface NewOptions {
  repo?: string;
  remote?: string;
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
  fast: boolean;
}

function getWorkflowDefaults(): WorkflowDefaults {
  if (!hasSettings()) {
    return {
      openPr: false,
      allowPrd: false,
      allowPlan: false,
      allowMerge: false,
      push: false,
      fast: true,
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
    fast: settings.workflow.defaultMode !== 'spec',
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
    .option('--remote <url>', t('cli:commands.feat.new.remoteOption'))
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
        // Conflict check: --remote and --repo are mutually exclusive
        if (options.remote && options.repo) {
          messages.error(t('cli:commands.feat.new.remoteConflict'));
          process.exitCode = 1;
          return;
        }

        // First-run onboarding gate — only for interactive terminals
        if (process.stdin.isTTY) {
          const checkOnboarding = container.resolve(CheckOnboardingStatusUseCase);
          const { isComplete } = await checkOnboarding.execute();
          if (!isComplete) {
            await onboardingWizard();
          }
        }

        let repoPath = options.repo ?? process.cwd();

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

        const fast = options.fast ?? defaults.fast;

        // Validate mutually exclusive mode flags
        if (options.explore && options.fast) {
          messages.error(t('cli:commands.feat.new.exploreAndFastConflict'));
          process.exitCode = 1;
          return;
        }

        const buildMode = options.explore
          ? BuildMode.Exploration
          : fast
            ? BuildMode.Fast
            : BuildMode.Application;

        const commonInput = {
          userInput: description,
          approvalGates,
          push,
          openPr,
          ...(parentId !== undefined && { parentId }),
          ...(options.pending && { pending: true }),
          ...(fast && { fast: true }),
          buildMode,
          ...(options.model !== undefined && { model: options.model }),
          ...(attachmentPaths.length > 0 && { attachmentPaths }),
        };

        let result: { feature: Feature; warning?: string };

        if (options.remote) {
          // Remote path: clone (or fork) then create feature
          const settings = getSettings();
          const defaultCloneDir = settings.environment?.defaultCloneDirectory;
          const remoteUseCase = container.resolve(CreateFeatureFromRemoteUseCase);
          result = await spinner(t('cli:commands.feat.new.spinnerText'), () =>
            remoteUseCase.execute({
              ...commonInput,
              remoteUrl: options.remote!,
              defaultCloneDir,
              cloneOptions: {
                onProgress: (msg: string) => process.stderr.write(msg),
              },
            })
          );
        } else {
          // Local path: create feature on existing repo
          const useCase = container.resolve(CreateFeatureUseCase);
          result = await spinner(t('cli:commands.feat.new.spinnerText'), () =>
            useCase.execute({
              ...commonInput,
              repositoryPath: repoPath,
              ...(options.injectSkills !== undefined && { injectSkills: options.injectSkills }),
              rebaseBeforeBranch: options.rebase,
            })
          );
        }

        const { feature, warning } = result;
        repoPath = options.remote ? feature.repositoryPath : (options.repo ?? process.cwd());
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
        if (options.remote && feature.repositoryId) {
          const repoRepo = container.resolve<IRepositoryRepository>('IRepositoryRepository');
          const repo = await repoRepo.findById(feature.repositoryId);
          if (repo?.isFork && repo.upstreamUrl) {
            const upstreamShort = repo.upstreamUrl.replace('https://github.com/', '');
            console.log(
              `  ${colors.muted('Fork:')}     ${colors.accent('yes')} (upstream: ${upstreamShort})`
            );
          }
        }
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
        // Handle GitHub-specific errors with actionable messages
        if (error instanceof GitHubAuthError) {
          messages.error('GitHub CLI is not authenticated. Run `gh auth login` to sign in.');
          process.exitCode = 1;
          return;
        }
        if (error instanceof GitHubUrlParseError) {
          messages.error(`Invalid GitHub URL: ${error.message}`);
          messages.info(
            'Supported formats: https://github.com/owner/repo, git@github.com:owner/repo.git, or owner/repo'
          );
          process.exitCode = 1;
          return;
        }
        if (error instanceof GitHubCloneError) {
          messages.error(`Clone failed: ${error.message}`);
          process.exitCode = 1;
          return;
        }
        if (error instanceof GitHubForkError) {
          messages.error(`Fork failed: ${error.message}`);
          process.exitCode = 1;
          return;
        }

        const err = error instanceof Error ? error : new Error(String(error));
        messages.error(t('cli:commands.feat.new.failedToCreate'), err);
        process.exitCode = 1;
      }
    });
}
