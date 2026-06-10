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
import { PromoteExplorationUseCase } from '../../../application/use-cases/features/promote/promote-exploration.use-case.js';
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
import { ReparentFeatureUseCase } from '../../../application/use-cases/features/reparent-feature.use-case.js';
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

// Doctor (feature 097) use case
import { RunDoctorUseCase } from '../../../application/use-cases/doctor/run-doctor.use-case.js';

// Contributor onboarding (feature 097) read use cases — wired for the web view
import { GetContributorLeaderboardUseCase } from '../../../application/use-cases/contributors/get-contributor-leaderboard.use-case.js';
import { GetCuratedIssuesByLaneUseCase } from '../../../application/use-cases/contributors/get-curated-issues-by-lane.use-case.js';

// Code review (feature 090) use cases
import { RunCodeReviewUseCase } from '../../../application/use-cases/code-review/run-code-review.use-case.js';
import { GetCodeReviewUseCase } from '../../../application/use-cases/code-review/get-code-review.use-case.js';
import { ListCodeReviewsUseCase } from '../../../application/use-cases/code-review/list-code-reviews.use-case.js';
import { PostCodeReviewUseCase } from '../../../application/use-cases/code-review/post-code-review.use-case.js';

// Collaboration (feature 093) use cases
import { SendAgentMessageUseCase } from '../../../application/use-cases/agents/send-agent-message.use-case.js';
import { ListAgentMessagesUseCase } from '../../../application/use-cases/agents/list-agent-messages.use-case.js';
import { AskAgentQuestionUseCase } from '../../../application/use-cases/agents/ask-agent-question.use-case.js';
import { AnswerAgentQuestionUseCase } from '../../../application/use-cases/agents/answer-agent-question.use-case.js';
import { CancelAgentQuestionUseCase } from '../../../application/use-cases/agents/cancel-agent-question.use-case.js';
import { ListAgentQuestionsUseCase } from '../../../application/use-cases/agents/list-agent-questions.use-case.js';
import { ConfigureSupervisorUseCase } from '../../../application/use-cases/agents/configure-supervisor.use-case.js';
import { EnableSupervisorUseCase } from '../../../application/use-cases/agents/enable-supervisor.use-case.js';
import { DisableSupervisorUseCase } from '../../../application/use-cases/agents/disable-supervisor.use-case.js';
import { GetSupervisorPolicyUseCase } from '../../../application/use-cases/agents/get-supervisor-policy.use-case.js';
import { ListSupervisorPoliciesUseCase } from '../../../application/use-cases/agents/list-supervisor-policies.use-case.js';
import { ListRecentSupervisorDecisionsUseCase } from '../../../application/use-cases/agents/list-recent-supervisor-decisions.use-case.js';
import { ListAgentPromptsUseCase } from '../../../application/use-cases/agents/list-agent-prompts.use-case.js';
import { UpsertAgentPromptOverrideUseCase } from '../../../application/use-cases/agents/upsert-agent-prompt-override.use-case.js';
import { DeleteAgentPromptOverrideUseCase } from '../../../application/use-cases/agents/delete-agent-prompt-override.use-case.js';
import { RunAgentPromptPlaygroundUseCase } from '../../../application/use-cases/agents/run-agent-prompt-playground.use-case.js';
import { GetAgentGraphUseCase } from '../../../application/use-cases/agents/get-agent-graph.use-case.js';
import { UpsertAgentGraphOverrideUseCase } from '../../../application/use-cases/agents/upsert-agent-graph-override.use-case.js';
import { DeleteAgentGraphOverrideUseCase } from '../../../application/use-cases/agents/delete-agent-graph-override.use-case.js';
import { CreateCustomAgentUseCase } from '../../../application/use-cases/agents/create-custom-agent.use-case.js';
import { ListCustomAgentsUseCase } from '../../../application/use-cases/agents/list-custom-agents.use-case.js';
import { DeleteCustomAgentUseCase } from '../../../application/use-cases/agents/delete-custom-agent.use-case.js';
import { EvaluateSupervisorDecisionUseCase } from '../../../application/use-cases/agents/evaluate-supervisor-decision.use-case.js';
import { AgentQuestionSupervisorRouter } from '../../../application/use-cases/agents/agent-question-supervisor-router.js';
import { EscalateToUserUseCase } from '../../../application/use-cases/agents/escalate-to-user.use-case.js';

// SDLC Board (feature 099) use cases
import { ListSdlcBoardUseCase } from '../../../application/use-cases/sdlc-board/list-sdlc-board.use-case.js';
import { UpdateSdlcTaskStatusUseCase } from '../../../application/use-cases/sdlc-board/update-sdlc-task-status.use-case.js';
import { ReorderSdlcTaskUseCase } from '../../../application/use-cases/sdlc-board/reorder-sdlc-task.use-case.js';
import { UpdateSdlcSubTaskStatusUseCase } from '../../../application/use-cases/sdlc-board/update-sdlc-subtask-status.use-case.js';

// Project memory ("Shep Brain", feature 102) use cases
import { ReadProjectMemoryUseCase } from '../../../application/use-cases/project-memory/read-project-memory.use-case.js';
import { SelectProjectMemoryUseCase } from '../../../application/use-cases/project-memory/select-project-memory.use-case.js';
import { RecordProjectMemoryUseCase } from '../../../application/use-cases/project-memory/record-project-memory.use-case.js';
import { ManageProjectMemoryUseCase } from '../../../application/use-cases/project-memory/manage-project-memory.use-case.js';

// Bedrock integration (feature 098) use cases
import { EnableBedrockForApplicationUseCase } from '../../../application/use-cases/applications/enable-bedrock-for-application.use-case.js';
import { RunBedrockLifecycleUseCase } from '../../../application/use-cases/applications/run-bedrock-lifecycle.use-case.js';
import { CheckBedrockHealthUseCase } from '../../../application/use-cases/applications/check-bedrock-health.use-case.js';
import { EnableBedrockForTargetUseCase } from '../../../application/use-cases/bedrock/enable-bedrock-for-target.use-case.js';
import { GetBedrockMemorySnapshotUseCase } from '../../../application/use-cases/bedrock/get-bedrock-memory-snapshot.use-case.js';
import {
  EnableBedrockForApplicationUseCaseToken,
  RunBedrockLifecycleUseCaseToken,
  CheckBedrockHealthUseCaseToken,
  EnableBedrockForTargetUseCaseToken,
  GetBedrockMemorySnapshotUseCaseToken,
} from '../tokens.js';

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
  container.registerSingleton(PromoteExplorationUseCase);
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
  container.registerSingleton(ReparentFeatureUseCase);
  container.registerSingleton(CreateApplicationUseCase);
  container.registerSingleton(ListApplicationsUseCase);
  container.registerSingleton(GetApplicationUseCase);
  container.registerSingleton(DeleteApplicationUseCase);
  container.registerSingleton(ResumeApplicationWorkflowUseCase);
  container.registerSingleton(UpdateApplicationUseCase);
  container.registerSingleton(ListAgentSessionsUseCase);
  container.registerSingleton(GetAgentSessionUseCase);
  container.registerSingleton(StreamAgentEventsUseCase);

  // ─── Doctor (feature 097) use case ──────────────────────────────────────
  container.registerSingleton(RunDoctorUseCase);

  // ─── Contributor onboarding (feature 097) read use cases ───────────────
  container.registerSingleton(GetContributorLeaderboardUseCase);
  container.registerSingleton(GetCuratedIssuesByLaneUseCase);

  // ─── Code review (feature 090) use cases ────────────────────────────────
  container.registerSingleton(RunCodeReviewUseCase);
  container.registerSingleton(GetCodeReviewUseCase);
  container.registerSingleton(ListCodeReviewsUseCase);
  container.registerSingleton(PostCodeReviewUseCase);

  // ─── Collaboration (feature 093) use cases ──────────────────────────────
  container.registerSingleton(SendAgentMessageUseCase);
  container.registerSingleton(ListAgentMessagesUseCase);
  container.registerSingleton(AskAgentQuestionUseCase);
  container.registerSingleton(AnswerAgentQuestionUseCase);
  container.registerSingleton(CancelAgentQuestionUseCase);
  container.registerSingleton(ListAgentQuestionsUseCase);
  container.registerSingleton(ConfigureSupervisorUseCase);
  container.registerSingleton(EnableSupervisorUseCase);
  container.registerSingleton(DisableSupervisorUseCase);
  container.registerSingleton(GetSupervisorPolicyUseCase);
  container.registerSingleton(ListSupervisorPoliciesUseCase);
  container.registerSingleton(ListRecentSupervisorDecisionsUseCase);
  container.registerSingleton(ListAgentPromptsUseCase);
  container.registerSingleton(UpsertAgentPromptOverrideUseCase);
  container.registerSingleton(DeleteAgentPromptOverrideUseCase);
  container.registerSingleton(RunAgentPromptPlaygroundUseCase);
  container.registerSingleton(GetAgentGraphUseCase);
  container.registerSingleton(UpsertAgentGraphOverrideUseCase);
  container.registerSingleton(DeleteAgentGraphOverrideUseCase);
  container.registerSingleton(CreateCustomAgentUseCase);
  container.registerSingleton(ListCustomAgentsUseCase);
  container.registerSingleton(DeleteCustomAgentUseCase);
  container.registerSingleton(EvaluateSupervisorDecisionUseCase);
  container.registerSingleton(AgentQuestionSupervisorRouter);
  container.registerSingleton(EscalateToUserUseCase);

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
  container.register('PromoteExplorationUseCase', {
    useFactory: (c) => c.resolve(PromoteExplorationUseCase),
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
  container.register('ReparentFeatureUseCase', {
    useFactory: (c) => c.resolve(ReparentFeatureUseCase),
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
  container.register('ListAgentRunsUseCase', {
    useFactory: (c) => c.resolve(ListAgentRunsUseCase),
  });

  container.registerSingleton(ImportWorkItemsCsvUseCase);
  container.register('ImportWorkItemsCsvUseCase', { useToken: ImportWorkItemsCsvUseCase });

  // ─── Code review (feature 090) string aliases ───────────────────────────
  container.register('RunCodeReviewUseCase', {
    useFactory: (c) => c.resolve(RunCodeReviewUseCase),
  });
  container.register('GetCodeReviewUseCase', {
    useFactory: (c) => c.resolve(GetCodeReviewUseCase),
  });
  container.register('ListCodeReviewsUseCase', {
    useFactory: (c) => c.resolve(ListCodeReviewsUseCase),
  });
  container.register('PostCodeReviewUseCase', {
    useFactory: (c) => c.resolve(PostCodeReviewUseCase),
  });

  // ─── Collaboration (feature 093) string aliases ─────────────────────────
  container.register('SendAgentMessageUseCase', {
    useFactory: (c) => c.resolve(SendAgentMessageUseCase),
  });
  container.register('ListAgentMessagesUseCase', {
    useFactory: (c) => c.resolve(ListAgentMessagesUseCase),
  });
  container.register('AnswerAgentQuestionUseCase', {
    useFactory: (c) => c.resolve(AnswerAgentQuestionUseCase),
  });
  container.register('CancelAgentQuestionUseCase', {
    useFactory: (c) => c.resolve(CancelAgentQuestionUseCase),
  });
  container.register('ListAgentQuestionsUseCase', {
    useFactory: (c) => c.resolve(ListAgentQuestionsUseCase),
  });
  container.register('ConfigureSupervisorUseCase', {
    useFactory: (c) => c.resolve(ConfigureSupervisorUseCase),
  });
  container.register('EnableSupervisorUseCase', {
    useFactory: (c) => c.resolve(EnableSupervisorUseCase),
  });
  container.register('DisableSupervisorUseCase', {
    useFactory: (c) => c.resolve(DisableSupervisorUseCase),
  });
  container.register('GetSupervisorPolicyUseCase', {
    useFactory: (c) => c.resolve(GetSupervisorPolicyUseCase),
  });
  container.register('ListSupervisorPoliciesUseCase', {
    useFactory: (c) => c.resolve(ListSupervisorPoliciesUseCase),
  });
  container.register('ListRecentSupervisorDecisionsUseCase', {
    useFactory: (c) => c.resolve(ListRecentSupervisorDecisionsUseCase),
  });
  container.register('ListAgentPromptsUseCase', {
    useFactory: (c) => c.resolve(ListAgentPromptsUseCase),
  });
  container.register('UpsertAgentPromptOverrideUseCase', {
    useFactory: (c) => c.resolve(UpsertAgentPromptOverrideUseCase),
  });
  container.register('DeleteAgentPromptOverrideUseCase', {
    useFactory: (c) => c.resolve(DeleteAgentPromptOverrideUseCase),
  });
  container.register('RunAgentPromptPlaygroundUseCase', {
    useFactory: (c) => c.resolve(RunAgentPromptPlaygroundUseCase),
  });
  container.register('GetAgentGraphUseCase', {
    useFactory: (c) => c.resolve(GetAgentGraphUseCase),
  });
  container.register('UpsertAgentGraphOverrideUseCase', {
    useFactory: (c) => c.resolve(UpsertAgentGraphOverrideUseCase),
  });
  container.register('DeleteAgentGraphOverrideUseCase', {
    useFactory: (c) => c.resolve(DeleteAgentGraphOverrideUseCase),
  });
  container.register('CreateCustomAgentUseCase', {
    useFactory: (c) => c.resolve(CreateCustomAgentUseCase),
  });
  container.register('ListCustomAgentsUseCase', {
    useFactory: (c) => c.resolve(ListCustomAgentsUseCase),
  });
  container.register('DeleteCustomAgentUseCase', {
    useFactory: (c) => c.resolve(DeleteCustomAgentUseCase),
  });

  // ─── SDLC Board (feature 099) use cases ─────────────────────────────────
  container.registerSingleton(ListSdlcBoardUseCase);
  container.registerSingleton(UpdateSdlcTaskStatusUseCase);
  container.registerSingleton(ReorderSdlcTaskUseCase);
  container.registerSingleton(UpdateSdlcSubTaskStatusUseCase);

  // ─── Project memory ("Shep Brain", feature 102) use cases ───────────────
  container.registerSingleton(ReadProjectMemoryUseCase);
  container.registerSingleton(SelectProjectMemoryUseCase);
  container.registerSingleton(RecordProjectMemoryUseCase);
  container.registerSingleton(ManageProjectMemoryUseCase);

  // ─── Bedrock integration (feature 098) use cases ────────────────────────
  container.registerSingleton(EnableBedrockForApplicationUseCase);
  container.registerSingleton(RunBedrockLifecycleUseCase);
  container.registerSingleton(CheckBedrockHealthUseCase);
  container.registerSingleton(EnableBedrockForTargetUseCase);
  container.registerSingleton(GetBedrockMemorySnapshotUseCase);

  container.register(EnableBedrockForApplicationUseCaseToken, {
    useFactory: (c) => c.resolve(EnableBedrockForApplicationUseCase),
  });
  container.register(RunBedrockLifecycleUseCaseToken, {
    useFactory: (c) => c.resolve(RunBedrockLifecycleUseCase),
  });
  container.register(CheckBedrockHealthUseCaseToken, {
    useFactory: (c) => c.resolve(CheckBedrockHealthUseCase),
  });
  container.register(EnableBedrockForTargetUseCaseToken, {
    useFactory: (c) => c.resolve(EnableBedrockForTargetUseCase),
  });
  container.register(GetBedrockMemorySnapshotUseCaseToken, {
    useFactory: (c) => c.resolve(GetBedrockMemorySnapshotUseCase),
  });

  // ─── Doctor + Contributor (feature 097) string aliases ─────────────────
  container.register('RunDoctorUseCase', {
    useFactory: (c) => c.resolve(RunDoctorUseCase),
  });
  container.register('GetContributorLeaderboardUseCase', {
    useFactory: (c) => c.resolve(GetContributorLeaderboardUseCase),
  });
  container.register('GetCuratedIssuesByLaneUseCase', {
    useFactory: (c) => c.resolve(GetCuratedIssuesByLaneUseCase),
  });

  // ─── SDLC Board (feature 099) string aliases ────────────────────────────
  container.register('ListSdlcBoardUseCase', {
    useFactory: (c) => c.resolve(ListSdlcBoardUseCase),
  });
  container.register('UpdateSdlcTaskStatusUseCase', {
    useFactory: (c) => c.resolve(UpdateSdlcTaskStatusUseCase),
  });
  container.register('ReorderSdlcTaskUseCase', {
    useFactory: (c) => c.resolve(ReorderSdlcTaskUseCase),
  });
  container.register('UpdateSdlcSubTaskStatusUseCase', {
    useFactory: (c) => c.resolve(UpdateSdlcSubTaskStatusUseCase),
  });

  // ─── Project memory ("Shep Brain", feature 102) string aliases ──────────
  container.register('ReadProjectMemoryUseCase', {
    useFactory: (c) => c.resolve(ReadProjectMemoryUseCase),
  });
  container.register('SelectProjectMemoryUseCase', {
    useFactory: (c) => c.resolve(SelectProjectMemoryUseCase),
  });
  container.register('RecordProjectMemoryUseCase', {
    useFactory: (c) => c.resolve(RecordProjectMemoryUseCase),
  });
  container.register('ManageProjectMemoryUseCase', {
    useFactory: (c) => c.resolve(ManageProjectMemoryUseCase),
  });
}
