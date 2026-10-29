/**
 * What `shep feat new` prints once a feature exists: its id, branch,
 * worktree, agent and review settings.
 */

import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { container } from '@/infrastructure/di/container.js';
import type { ApprovalGates, Feature } from '@/domain/generated/output.js';
import { SdlcLifecycle } from '@/domain/generated/output.js';
import type { IRepositoryRepository } from '@/application/ports/output/repositories/repository-repository.interface.js';
import { getShepHomeDir } from '@/infrastructure/services/filesystem/shep-directory.service.js';
import { colors, messages } from '../../ui/index.js';
import { getCliI18n } from '../../i18n.js';

export interface CreatedFeatureContext {
  repo?: string;
  remote?: string;
  push: boolean;
  openPr: boolean;
  approvalGates: ApprovalGates;
}

export async function printCreatedFeature(
  result: { feature: Feature; warning?: string },
  context: CreatedFeatureContext
): Promise<void> {
  const t = getCliI18n().t;
  const { push, openPr, approvalGates } = context;
  const { feature, warning } = result;
  const repoPath = context.remote ? feature.repositoryPath : (context.repo ?? process.cwd());
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
  console.log(`  ${colors.muted(t('cli:commands.feat.new.statusLabel'))}   ${feature.lifecycle}`);
  console.log(`  ${colors.muted(t('cli:commands.feat.new.worktreeLabel'))} ${worktreePath}`);
  if (context.remote && feature.repositoryId) {
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
    console.log(`  ${colors.muted(t('cli:commands.feat.new.specLabel'))}     ${feature.specPath}`);
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
}
