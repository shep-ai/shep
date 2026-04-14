import type { DependencyContainer } from 'tsyringe';

import { ImportWorkItemsCsvUseCase } from '../../../application/use-cases/import-export/import-work-items-csv.use-case.js';
import { InitializeSettingsUseCase } from '../../../application/use-cases/settings/initialize-settings.use-case.js';
import { LoadSettingsUseCase } from '../../../application/use-cases/settings/load-settings.use-case.js';
import { UpdateSettingsUseCase } from '../../../application/use-cases/settings/update-settings.use-case.js';
import { CompleteOnboardingUseCase } from '../../../application/use-cases/settings/complete-onboarding.use-case.js';
import { CompleteWebOnboardingUseCase } from '../../../application/use-cases/settings/complete-web-onboarding.use-case.js';
import { CheckOnboardingStatusUseCase } from '../../../application/use-cases/settings/check-onboarding-status.use-case.js';
import { ConfigureAgentUseCase } from '../../../application/use-cases/agents/configure-agent.use-case.js';
import { ValidateAgentAuthUseCase } from '../../../application/use-cases/agents/validate-agent-auth.use-case.js';
import { RunAgentUseCase } from '../../../application/use-cases/agents/run-agent.use-case.js';
import { GetAgentRunUseCase } from '../../../application/use-cases/agents/get-agent-run.use-case.js';
import { ListAgentRunsUseCase } from '../../../application/use-cases/agents/list-agent-runs.use-case.js';
import { StopAgentRunUseCase } from '../../../application/use-cases/agents/stop-agent-run.use-case.js';
import { DeleteAgentRunUseCase } from '../../../application/use-cases/agents/delete-agent-run.use-case.js';
import { ApproveAgentRunUseCase } from '../../../application/use-cases/agents/approve-agent-run.use-case.js';
import { RejectAgentRunUseCase } from '../../../application/use-cases/agents/reject-agent-run.use-case.js';
import { ReviewFeatureUseCase } from '../../../application/use-cases/agents/review-feature.use-case.js';
import { CreateFeatureUseCase } from '../../../application/use-cases/features/create/create-feature.use-case.js';
import { MetadataGenerator } from '../../../application/use-cases/features/create/metadata-generator.js';
import { SlugResolver } from '../../../application/use-cases/features/create/slug-resolver.js';
import { ListFeaturesUseCase } from '../../../application/use-cases/features/list-features.use-case.js';
import { ShowFeatureUseCase } from '../../../application/use-cases/features/show-feature.use-case.js';
import { DeleteFeatureUseCase } from '../../../application/use-cases/features/delete-feature.use-case.js';
import { ResumeFeatureUseCase } from '../../../application/use-cases/features/resume-feature.use-case.js';
import { StartFeatureUseCase } from '../../../application/use-cases/features/start-feature.use-case.js';
import { UpdateFeaturePinnedConfigUseCase } from '../../../application/use-cases/features/update-feature-pinned-config.use-case.js';
import { AdoptBranchUseCase } from '../../../application/use-cases/features/adopt-branch.use-case.js';
import { GetFeatureArtifactUseCase } from '../../../application/use-cases/features/get-feature-artifact.use-case.js';
import { GetResearchArtifactUseCase } from '../../../application/use-cases/features/get-research-artifact.use-case.js';
import { GetPlanArtifactUseCase } from '../../../application/use-cases/features/get-plan-artifact.use-case.js';
import { ValidateToolAvailabilityUseCase } from '../../../application/use-cases/tools/validate-tool-availability.use-case.js';
import { InstallToolUseCase } from '../../../application/use-cases/tools/install-tool.use-case.js';
import { ListToolsUseCase } from '../../../application/use-cases/tools/list-tools.use-case.js';
import { LaunchToolUseCase } from '../../../application/use-cases/tools/launch-tool.use-case.js';
import { LaunchIdeUseCase } from '../../../application/use-cases/ide/launch-ide.use-case.js';
import { AddRepositoryUseCase } from '../../../application/use-cases/repositories/add-repository.use-case.js';
import { CreateProjectUseCase } from '../../../application/use-cases/projects/create-project.use-case.js';
import { CheckAgentAuthUseCase } from '../../../application/use-cases/agents/check-agent-auth.use-case.js';
import { ListRepositoriesUseCase } from '../../../application/use-cases/repositories/list-repositories.use-case.js';
import { DeleteRepositoryUseCase } from '../../../application/use-cases/repositories/delete-repository.use-case.js';
import { ImportGitHubRepositoryUseCase } from '../../../application/use-cases/repositories/import-github-repository.use-case.js';
import { InitRemoteRepositoryUseCase } from '../../../application/use-cases/repositories/init-remote-repository.use-case.js';
import { ListGitHubRepositoriesUseCase } from '../../../application/use-cases/repositories/list-github-repositories.use-case.js';
import { ListGitHubOrganizationsUseCase } from '../../../application/use-cases/repositories/list-github-organizations.use-case.js';
import { ListOperationLogEntriesUseCase } from '../../../application/use-cases/operations/list-operation-log-entries.use-case.js';
import { CreateFeatureFromRemoteUseCase } from '../../../application/use-cases/features/create/create-feature-from-remote.use-case.js';
import { CheckAndUnblockFeaturesUseCase } from '../../../application/use-cases/features/check-and-unblock-features.use-case.js';
import { UpdateFeatureLifecycleUseCase } from '../../../application/use-cases/features/update/update-feature-lifecycle.use-case.js';
import { CleanupFeatureWorktreeUseCase } from '../../../application/use-cases/features/cleanup-feature-worktree.use-case.js';
import { ArchiveFeatureUseCase } from '../../../application/use-cases/features/archive-feature.use-case.js';
import { UnarchiveFeatureUseCase } from '../../../application/use-cases/features/unarchive-feature.use-case.js';
import { UpgradeCliUseCase } from '../../../application/use-cases/upgrade/upgrade-cli.use-case.js';
import { SyncRepositoryMainUseCase } from '../../../application/use-cases/repositories/sync-repository-main.use-case.js';
import { RebaseFeatureOnMainUseCase } from '../../../application/use-cases/features/rebase-feature-on-main.use-case.js';
import { GetBranchSyncStatusUseCase } from '../../../application/use-cases/features/get-branch-sync-status.use-case.js';
import { AutoResolveMergedBranchesUseCase } from '../../../application/use-cases/features/auto-resolve-merged-branches.use-case.js';
import { CreateApplicationUseCase } from '../../../application/use-cases/applications/create-application.use-case.js';
import { ListApplicationsUseCase } from '../../../application/use-cases/applications/list-applications.use-case.js';
import { GetApplicationUseCase } from '../../../application/use-cases/applications/get-application.use-case.js';
import { DeleteApplicationUseCase } from '../../../application/use-cases/applications/delete-application.use-case.js';
import { ResumeApplicationWorkflowUseCase } from '../../../application/use-cases/applications/resume-application-workflow.use-case.js';
import { UpdateApplicationUseCase } from '../../../application/use-cases/applications/update-application.use-case.js';
import { CreateTerminalSessionUseCase } from '../../../application/use-cases/terminal/create-terminal-session.use-case.js';
import { ListApplicationFilesUseCase } from '../../../application/use-cases/applications/list-application-files.use-case.js';
import { ReadApplicationFileUseCase } from '../../../application/use-cases/applications/read-application-file.use-case.js';
import { ReadApplicationFileRawUseCase } from '../../../application/use-cases/applications/read-application-file-raw.use-case.js';
import { WriteApplicationFileUseCase } from '../../../application/use-cases/applications/write-application-file.use-case.js';
import { WatchApplicationFilesUseCase } from '../../../application/use-cases/applications/watch-application-files.use-case.js';
import { ListAgentSessionsUseCase } from '../../../application/use-cases/agents/list-agent-sessions.use-case.js';
import { GetAgentSessionUseCase } from '../../../application/use-cases/agents/get-agent-session.use-case.js';
import { StreamAgentEventsUseCase } from '../../../application/use-cases/agents/stream-agent-events.use-case.js';

/**
 * Register the main body of application use cases (settings, agents, features,
 * tools, repositories, applications, projects, archival, upgrade, sessions) and
 * their string-token aliases used by the web server routes.
 *
 * Cloud-deploy, local-deployment, and interactive-session use cases live in
 * their own modules (`register-cloud-deploy.ts`, `register-deployment.ts`,
 * `register-interactive.ts`).
 */
export function registerUseCases(container: DependencyContainer): void {
  // ─── Use-case singletons ─────────────────────────────────────────────────
  container.registerSingleton(InitializeSettingsUseCase);
  container.registerSingleton(LoadSettingsUseCase);
  container.registerSingleton(UpdateSettingsUseCase);
  container.registerSingleton(CompleteOnboardingUseCase);
  container.registerSingleton(CompleteWebOnboardingUseCase);
  container.registerSingleton(CheckOnboardingStatusUseCase);
  container.registerSingleton(ConfigureAgentUseCase);
  container.registerSingleton(ValidateAgentAuthUseCase);
  container.registerSingleton(RunAgentUseCase);
  container.registerSingleton(GetAgentRunUseCase);
  container.registerSingleton(ListAgentRunsUseCase);
  container.registerSingleton(StopAgentRunUseCase);
  container.registerSingleton(DeleteAgentRunUseCase);
  container.registerSingleton(ApproveAgentRunUseCase);
  container.registerSingleton(RejectAgentRunUseCase);
  container.registerSingleton(ReviewFeatureUseCase);
  container.registerSingleton(MetadataGenerator);
  container.registerSingleton(SlugResolver);
  container.registerSingleton(CreateFeatureUseCase);
  container.registerSingleton(ListFeaturesUseCase);
  container.registerSingleton(ShowFeatureUseCase);
  container.registerSingleton(DeleteFeatureUseCase);
  container.registerSingleton(ResumeFeatureUseCase);
  container.registerSingleton(StartFeatureUseCase);
  container.registerSingleton(UpdateFeaturePinnedConfigUseCase);
  container.registerSingleton(AdoptBranchUseCase);
  container.registerSingleton(GetFeatureArtifactUseCase);
  container.registerSingleton(GetResearchArtifactUseCase);
  container.registerSingleton(GetPlanArtifactUseCase);
  container.registerSingleton(ValidateToolAvailabilityUseCase);
  container.registerSingleton(InstallToolUseCase);
  container.registerSingleton(ListToolsUseCase);
  container.registerSingleton(LaunchToolUseCase);
  container.registerSingleton(LaunchIdeUseCase);
  container.registerSingleton(CreateTerminalSessionUseCase);
  container.registerSingleton(ListApplicationFilesUseCase);
  container.registerSingleton(ReadApplicationFileUseCase);
  container.registerSingleton(ReadApplicationFileRawUseCase);
  container.registerSingleton(WriteApplicationFileUseCase);
  container.registerSingleton(WatchApplicationFilesUseCase);
  container.registerSingleton(AddRepositoryUseCase);
  container.registerSingleton(CreateProjectUseCase);
  container.registerSingleton(CheckAgentAuthUseCase);
  container.registerSingleton(ListRepositoriesUseCase);
  container.registerSingleton(DeleteRepositoryUseCase);
  container.registerSingleton(ImportGitHubRepositoryUseCase);
  container.registerSingleton(InitRemoteRepositoryUseCase);
  container.registerSingleton(CreateFeatureFromRemoteUseCase);
  container.registerSingleton(ListGitHubRepositoriesUseCase);
  container.registerSingleton(ListGitHubOrganizationsUseCase);
  container.registerSingleton(ListOperationLogEntriesUseCase);
  // CheckAndUnblockFeaturesUseCase must be registered before UpdateFeatureLifecycleUseCase
  // because the latter injects the former via class token.
  container.registerSingleton(CheckAndUnblockFeaturesUseCase);
  container.registerSingleton(UpdateFeatureLifecycleUseCase);
  container.registerSingleton(CleanupFeatureWorktreeUseCase);
  container.registerSingleton(ArchiveFeatureUseCase);
  container.registerSingleton(UnarchiveFeatureUseCase);
  container.registerSingleton(UpgradeCliUseCase);
  container.registerSingleton(SyncRepositoryMainUseCase);
  container.registerSingleton(RebaseFeatureOnMainUseCase);
  container.registerSingleton(GetBranchSyncStatusUseCase);
  container.registerSingleton(AutoResolveMergedBranchesUseCase);
  container.registerSingleton(CreateApplicationUseCase);
  container.registerSingleton(ListApplicationsUseCase);
  container.registerSingleton(GetApplicationUseCase);
  container.registerSingleton(DeleteApplicationUseCase);
  container.registerSingleton(ResumeApplicationWorkflowUseCase);
  container.registerSingleton(UpdateApplicationUseCase);
  container.registerSingleton(ListAgentSessionsUseCase);
  container.registerSingleton(GetAgentSessionUseCase);
  container.registerSingleton(StreamAgentEventsUseCase);

  // ─── String-token aliases for web routes ─────────────────────────────────
  // Turbopack can't resolve .js→.ts imports inside @shepai/core, so routes use
  // string tokens instead of class refs.
  container.register('CreateFeatureUseCase', {
    useFactory: (c) => c.resolve(CreateFeatureUseCase),
  });
  container.register('ListFeaturesUseCase', {
    useFactory: (c) => c.resolve(ListFeaturesUseCase),
  });
  container.register('ShowFeatureUseCase', {
    useFactory: (c) => c.resolve(ShowFeatureUseCase),
  });
  container.register('DeleteFeatureUseCase', {
    useFactory: (c) => c.resolve(DeleteFeatureUseCase),
  });
  container.register('ResumeFeatureUseCase', {
    useFactory: (c) => c.resolve(ResumeFeatureUseCase),
  });
  container.register('StartFeatureUseCase', {
    useFactory: (c) => c.resolve(StartFeatureUseCase),
  });
  container.register('UpdateFeaturePinnedConfigUseCase', {
    useFactory: (c) => c.resolve(UpdateFeaturePinnedConfigUseCase),
  });
  container.register('AdoptBranchUseCase', {
    useFactory: (c) => c.resolve(AdoptBranchUseCase),
  });
  container.register('StopAgentRunUseCase', {
    useFactory: (c) => c.resolve(StopAgentRunUseCase),
  });
  container.register('ApproveAgentRunUseCase', {
    useFactory: (c) => c.resolve(ApproveAgentRunUseCase),
  });
  container.register('RejectAgentRunUseCase', {
    useFactory: (c) => c.resolve(RejectAgentRunUseCase),
  });
  container.register('GetFeatureArtifactUseCase', {
    useFactory: (c) => c.resolve(GetFeatureArtifactUseCase),
  });
  container.register('GetResearchArtifactUseCase', {
    useFactory: (c) => c.resolve(GetResearchArtifactUseCase),
  });
  container.register('GetPlanArtifactUseCase', {
    useFactory: (c) => c.resolve(GetPlanArtifactUseCase),
  });
  container.register('InstallToolUseCase', {
    useFactory: (c) => c.resolve(InstallToolUseCase),
  });
  container.register('ListToolsUseCase', {
    useFactory: (c) => c.resolve(ListToolsUseCase),
  });
  container.register('LaunchToolUseCase', {
    useFactory: (c) => c.resolve(LaunchToolUseCase),
  });
  container.register('LaunchIdeUseCase', {
    useFactory: (c) => c.resolve(LaunchIdeUseCase),
  });
  container.register('AddRepositoryUseCase', {
    useFactory: (c) => c.resolve(AddRepositoryUseCase),
  });
  container.register('CreateProjectUseCase', {
    useFactory: (c) => c.resolve(CreateProjectUseCase),
  });
  container.register('CheckAgentAuthUseCase', {
    useFactory: (c) => c.resolve(CheckAgentAuthUseCase),
  });
  container.register('ListRepositoriesUseCase', {
    useFactory: (c) => c.resolve(ListRepositoriesUseCase),
  });
  container.register('DeleteRepositoryUseCase', {
    useFactory: (c) => c.resolve(DeleteRepositoryUseCase),
  });
  container.register('ImportGitHubRepositoryUseCase', {
    useFactory: (c) => c.resolve(ImportGitHubRepositoryUseCase),
  });
  container.register('InitRemoteRepositoryUseCase', {
    useFactory: (c) => c.resolve(InitRemoteRepositoryUseCase),
  });
  container.register('CreateFeatureFromRemoteUseCase', {
    useFactory: (c) => c.resolve(CreateFeatureFromRemoteUseCase),
  });
  container.register('ListGitHubRepositoriesUseCase', {
    useFactory: (c) => c.resolve(ListGitHubRepositoriesUseCase),
  });
  container.register('ListGitHubOrganizationsUseCase', {
    useFactory: (c) => c.resolve(ListGitHubOrganizationsUseCase),
  });
  container.register('ListOperationLogEntriesUseCase', {
    useFactory: (c) => c.resolve(ListOperationLogEntriesUseCase),
  });
  container.register('CheckAndUnblockFeaturesUseCase', {
    useFactory: (c) => c.resolve(CheckAndUnblockFeaturesUseCase),
  });
  container.register('UpdateFeatureLifecycleUseCase', {
    useFactory: (c) => c.resolve(UpdateFeatureLifecycleUseCase),
  });
  container.register('LoadSettingsUseCase', {
    useFactory: (c) => c.resolve(LoadSettingsUseCase),
  });
  container.register('UpdateSettingsUseCase', {
    useFactory: (c) => c.resolve(UpdateSettingsUseCase),
  });
  container.register('CompleteWebOnboardingUseCase', {
    useFactory: (c) => c.resolve(CompleteWebOnboardingUseCase),
  });
  container.register('CleanupFeatureWorktreeUseCase', {
    useFactory: (c) => c.resolve(CleanupFeatureWorktreeUseCase),
  });
  container.register('ArchiveFeatureUseCase', {
    useFactory: (c) => c.resolve(ArchiveFeatureUseCase),
  });
  container.register('UnarchiveFeatureUseCase', {
    useFactory: (c) => c.resolve(UnarchiveFeatureUseCase),
  });
  container.register('UpgradeCliUseCase', {
    useFactory: (c) => c.resolve(UpgradeCliUseCase),
  });
  container.register('SyncRepositoryMainUseCase', {
    useFactory: (c) => c.resolve(SyncRepositoryMainUseCase),
  });
  container.register('RebaseFeatureOnMainUseCase', {
    useFactory: (c) => c.resolve(RebaseFeatureOnMainUseCase),
  });
  container.register('GetBranchSyncStatusUseCase', {
    useFactory: (c) => c.resolve(GetBranchSyncStatusUseCase),
  });
  container.register('AutoResolveMergedBranchesUseCase', {
    useFactory: (c) => c.resolve(AutoResolveMergedBranchesUseCase),
  });
  container.register('CreateApplicationUseCase', {
    useFactory: (c) => c.resolve(CreateApplicationUseCase),
  });
  container.register('ListApplicationsUseCase', {
    useFactory: (c) => c.resolve(ListApplicationsUseCase),
  });
  container.register('GetApplicationUseCase', {
    useFactory: (c) => c.resolve(GetApplicationUseCase),
  });
  container.register('DeleteApplicationUseCase', {
    useFactory: (c) => c.resolve(DeleteApplicationUseCase),
  });
  container.register('ResumeApplicationWorkflowUseCase', {
    useFactory: (c) => c.resolve(ResumeApplicationWorkflowUseCase),
  });
  container.register('UpdateApplicationUseCase', {
    useFactory: (c) => c.resolve(UpdateApplicationUseCase),
  });
  container.register('ListApplicationFilesUseCase', {
    useFactory: (c) => c.resolve(ListApplicationFilesUseCase),
  });
  container.register('ReadApplicationFileUseCase', {
    useFactory: (c) => c.resolve(ReadApplicationFileUseCase),
  });
  container.register('ReadApplicationFileRawUseCase', {
    useFactory: (c) => c.resolve(ReadApplicationFileRawUseCase),
  });
  container.register('WriteApplicationFileUseCase', {
    useFactory: (c) => c.resolve(WriteApplicationFileUseCase),
  });
  container.register('WatchApplicationFilesUseCase', {
    useFactory: (c) => c.resolve(WatchApplicationFilesUseCase),
  });
  container.register('CreateTerminalSessionUseCase', {
    useFactory: (c) => c.resolve(CreateTerminalSessionUseCase),
  });
  container.register('StreamAgentEventsUseCase', {
    useFactory: (c) => c.resolve(StreamAgentEventsUseCase),
  });

  container.registerSingleton(ImportWorkItemsCsvUseCase);
  container.register('ImportWorkItemsCsvUseCase', { useToken: ImportWorkItemsCsvUseCase });
}
