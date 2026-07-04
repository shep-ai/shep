import type { DependencyContainer } from 'tsyringe';

// ─── Auth (feature 087) use cases ───────────────────────────────────────────
import { LoginUserUseCase } from '../../../application/use-cases/auth/login-user.use-case.js';
import { LogoutUserUseCase } from '../../../application/use-cases/auth/logout-user.use-case.js';
import { RegisterUserUseCase } from '../../../application/use-cases/auth/register-user.use-case.js';
import { ValidateSessionUseCase } from '../../../application/use-cases/auth/validate-session.use-case.js';

// ─── PM Projects (feature 087) use cases ────────────────────────────────────
import { ListPmProjectsUseCase } from '../../../application/use-cases/pm-projects/list-pm-projects.use-case.js';
import { CreatePmProjectUseCase } from '../../../application/use-cases/pm-projects/create-pm-project.use-case.js';
import { GetPmProjectUseCase } from '../../../application/use-cases/pm-projects/get-pm-project.use-case.js';
import { UpdatePmProjectUseCase } from '../../../application/use-cases/pm-projects/update-pm-project.use-case.js';
import { DeletePmProjectUseCase } from '../../../application/use-cases/pm-projects/delete-pm-project.use-case.js';

// ─── Work Items (feature 087) use cases ─────────────────────────────────────
import { ListWorkItemsUseCase } from '../../../application/use-cases/work-items/list-work-items.use-case.js';
import { CreateWorkItemUseCase } from '../../../application/use-cases/work-items/create-work-item.use-case.js';
import { GetWorkItemUseCase } from '../../../application/use-cases/work-items/get-work-item.use-case.js';
import { UpdateWorkItemUseCase } from '../../../application/use-cases/work-items/update-work-item.use-case.js';
import { DeleteWorkItemUseCase } from '../../../application/use-cases/work-items/delete-work-item.use-case.js';
import { BulkUpdateWorkItemsUseCase } from '../../../application/use-cases/work-items/bulk-update-work-items.use-case.js';
import { ManageWorkItemStatesUseCase } from '../../../application/use-cases/work-item-states/manage-work-item-states.use-case.js';
import { CreateWorkItemRelationUseCase } from '../../../application/use-cases/work-item-relations/create-work-item-relation.use-case.js';
import { ListWorkItemRelationsUseCase } from '../../../application/use-cases/work-item-relations/list-work-item-relations.use-case.js';
import { DeleteWorkItemRelationUseCase } from '../../../application/use-cases/work-item-relations/delete-work-item-relation.use-case.js';

// ─── Labels (feature 087) use cases ─────────────────────────────────────────
import { ManageLabelsUseCase } from '../../../application/use-cases/labels/manage-labels.use-case.js';

// ─── Cycles (feature 087) use cases ─────────────────────────────────────────
import { ListCyclesUseCase } from '../../../application/use-cases/cycles/list-cycles.use-case.js';
import { CreateCycleUseCase } from '../../../application/use-cases/cycles/create-cycle.use-case.js';
import { UpdateCycleUseCase } from '../../../application/use-cases/cycles/update-cycle.use-case.js';
import { DeleteCycleUseCase } from '../../../application/use-cases/cycles/delete-cycle.use-case.js';
import { AddItemsToCycleUseCase } from '../../../application/use-cases/cycles/add-items-to-cycle.use-case.js';
import { RemoveItemsFromCycleUseCase } from '../../../application/use-cases/cycles/remove-items-from-cycle.use-case.js';
import { TransferCycleItemsUseCase } from '../../../application/use-cases/cycles/transfer-cycle-items.use-case.js';

// ─── Modules (feature 087) use cases ────────────────────────────────────────
import { ListModulesUseCase } from '../../../application/use-cases/modules/list-modules.use-case.js';
import { CreateModuleUseCase } from '../../../application/use-cases/modules/create-module.use-case.js';
import { UpdateModuleUseCase } from '../../../application/use-cases/modules/update-module.use-case.js';
import { DeleteModuleUseCase } from '../../../application/use-cases/modules/delete-module.use-case.js';
import { AddItemsToModuleUseCase } from '../../../application/use-cases/modules/add-items-to-module.use-case.js';
import { RemoveItemsFromModuleUseCase } from '../../../application/use-cases/modules/remove-items-from-module.use-case.js';

// ─── Epics (feature 087) use cases ──────────────────────────────────────────
import { ListEpicsUseCase } from '../../../application/use-cases/epics/list-epics.use-case.js';
import { CreateEpicUseCase } from '../../../application/use-cases/epics/create-epic.use-case.js';
import { UpdateEpicUseCase } from '../../../application/use-cases/epics/update-epic.use-case.js';
import { DeleteEpicUseCase } from '../../../application/use-cases/epics/delete-epic.use-case.js';

// ─── Pages (feature 087) use cases ──────────────────────────────────────────
import { ListPagesUseCase } from '../../../application/use-cases/pages/list-pages.use-case.js';
import { CreatePageUseCase } from '../../../application/use-cases/pages/create-page.use-case.js';
import { GetPageUseCase } from '../../../application/use-cases/pages/get-page.use-case.js';
import { UpdatePageUseCase } from '../../../application/use-cases/pages/update-page.use-case.js';
import { DeletePageUseCase } from '../../../application/use-cases/pages/delete-page.use-case.js';

// ─── Attachments (feature 087) use cases ────────────────────────────────────
import { ListAttachmentsUseCase } from '../../../application/use-cases/pm-attachments/list-attachments.use-case.js';
import { UploadAttachmentUseCase } from '../../../application/use-cases/pm-attachments/upload-attachment.use-case.js';
import { DeleteAttachmentUseCase } from '../../../application/use-cases/pm-attachments/delete-attachment.use-case.js';

// ─── Time Entries (feature 087) use cases ───────────────────────────────────
import { ListTimeEntriesUseCase } from '../../../application/use-cases/time-entries/list-time-entries.use-case.js';
import { LogTimeEntryUseCase } from '../../../application/use-cases/time-entries/log-time-entry.use-case.js';
import { DeleteTimeEntryUseCase } from '../../../application/use-cases/time-entries/delete-time-entry.use-case.js';

// ─── Comments (feature 087) use cases ───────────────────────────────────────
import { ManageCommentsUseCase } from '../../../application/use-cases/comments/manage-comments.use-case.js';

// ─── Saved Views (feature 087) use cases ────────────────────────────────────
import { ManageSavedViewsUseCase } from '../../../application/use-cases/saved-views/manage-saved-views.use-case.js';

// ─── Custom Properties (feature 087) use cases ──────────────────────────────
import { ManageCustomPropertiesUseCase } from '../../../application/use-cases/custom-properties/manage-custom-properties.use-case.js';

// ─── Activity Log (feature 087) use cases ───────────────────────────────────
import { ListActivityLogUseCase } from '../../../application/use-cases/activity-log/list-activity-log.use-case.js';

// ─── Notifications (feature 087) use cases ──────────────────────────────────
import { ListNotificationsUseCase } from '../../../application/use-cases/notifications/list-notifications.use-case.js';
import { MarkNotificationReadUseCase } from '../../../application/use-cases/notifications/mark-notification-read.use-case.js';

// ─── Project Members (feature 087) use cases ────────────────────────────────
import { AddProjectMemberUseCase } from '../../../application/use-cases/project-members/add-project-member.use-case.js';
import { ListProjectMembersUseCase } from '../../../application/use-cases/project-members/list-project-members.use-case.js';
import { RemoveProjectMemberUseCase } from '../../../application/use-cases/project-members/remove-project-member.use-case.js';
import { UpdateProjectMemberRoleUseCase } from '../../../application/use-cases/project-members/update-project-member-role.use-case.js';

// ─── Analytics (feature 087) use cases ──────────────────────────────────────
import { GetAiCycleSummaryUseCase } from '../../../application/use-cases/analytics/get-ai-cycle-summary.use-case.js';
import { GetAiProjectHealthUseCase } from '../../../application/use-cases/analytics/get-ai-project-health.use-case.js';
import { GetCycleBurndownUseCase } from '../../../application/use-cases/analytics/get-cycle-burndown.use-case.js';
import { GetModuleProgressUseCase } from '../../../application/use-cases/analytics/get-module-progress.use-case.js';
import { GetProjectBreakdownUseCase } from '../../../application/use-cases/analytics/get-project-breakdown.use-case.js';

// ─── Intake (feature 087) use cases ─────────────────────────────────────────
import { ListIntakeItemsUseCase } from '../../../application/use-cases/intake/list-intake-items.use-case.js';
import { CreateIntakeItemUseCase } from '../../../application/use-cases/intake/create-intake-item.use-case.js';
import { AcceptIntakeItemUseCase } from '../../../application/use-cases/intake/accept-intake-item.use-case.js';
import { AutoTriageIntakeItemUseCase } from '../../../application/use-cases/intake/auto-triage-intake-item.use-case.js';
import { DeclineIntakeItemUseCase } from '../../../application/use-cases/intake/decline-intake-item.use-case.js';
import { DetectDuplicatesUseCase } from '../../../application/use-cases/intake/detect-duplicates.use-case.js';

// ─── Import/Export (feature 087) use cases ──────────────────────────────────
import { ExportWorkItemsCsvUseCase } from '../../../application/use-cases/import-export/export-work-items-csv.use-case.js';

// ─── Global Search use case ──────────────────────────────────────────────────
import { GlobalSearchUseCase } from '../../../application/use-cases/search/global-search.use-case.js';

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

  // ─── Auth (feature 087) ─────────────────────────────────────────────────
  container.registerSingleton(LoginUserUseCase);
  container.register('LoginUserUseCase', { useFactory: (c) => c.resolve(LoginUserUseCase) });
  container.registerSingleton(LogoutUserUseCase);
  container.register('LogoutUserUseCase', { useFactory: (c) => c.resolve(LogoutUserUseCase) });
  container.registerSingleton(RegisterUserUseCase);
  container.register('RegisterUserUseCase', { useFactory: (c) => c.resolve(RegisterUserUseCase) });
  container.registerSingleton(ValidateSessionUseCase);
  container.register('ValidateSessionUseCase', {
    useFactory: (c) => c.resolve(ValidateSessionUseCase),
  });

  // ─── PM Projects (feature 087) ──────────────────────────────────────────
  container.registerSingleton(ListPmProjectsUseCase);
  container.register('ListPmProjectsUseCase', {
    useFactory: (c) => c.resolve(ListPmProjectsUseCase),
  });
  container.registerSingleton(CreatePmProjectUseCase);
  container.register('CreatePmProjectUseCase', {
    useFactory: (c) => c.resolve(CreatePmProjectUseCase),
  });
  container.registerSingleton(GetPmProjectUseCase);
  container.register('GetPmProjectUseCase', { useFactory: (c) => c.resolve(GetPmProjectUseCase) });
  container.registerSingleton(UpdatePmProjectUseCase);
  container.register('UpdatePmProjectUseCase', {
    useFactory: (c) => c.resolve(UpdatePmProjectUseCase),
  });
  container.registerSingleton(DeletePmProjectUseCase);
  container.register('DeletePmProjectUseCase', {
    useFactory: (c) => c.resolve(DeletePmProjectUseCase),
  });

  // ─── Work Items (feature 087) ────────────────────────────────────────────
  container.registerSingleton(ListWorkItemsUseCase);
  container.register('ListWorkItemsUseCase', {
    useFactory: (c) => c.resolve(ListWorkItemsUseCase),
  });
  container.registerSingleton(CreateWorkItemUseCase);
  container.register('CreateWorkItemUseCase', {
    useFactory: (c) => c.resolve(CreateWorkItemUseCase),
  });
  container.registerSingleton(GetWorkItemUseCase);
  container.register('GetWorkItemUseCase', { useFactory: (c) => c.resolve(GetWorkItemUseCase) });
  container.registerSingleton(UpdateWorkItemUseCase);
  container.register('UpdateWorkItemUseCase', {
    useFactory: (c) => c.resolve(UpdateWorkItemUseCase),
  });
  container.registerSingleton(DeleteWorkItemUseCase);
  container.register('DeleteWorkItemUseCase', {
    useFactory: (c) => c.resolve(DeleteWorkItemUseCase),
  });
  container.registerSingleton(BulkUpdateWorkItemsUseCase);
  container.register('BulkUpdateWorkItemsUseCase', {
    useFactory: (c) => c.resolve(BulkUpdateWorkItemsUseCase),
  });
  container.registerSingleton(ManageWorkItemStatesUseCase);
  container.register('ManageWorkItemStatesUseCase', {
    useFactory: (c) => c.resolve(ManageWorkItemStatesUseCase),
  });
  container.registerSingleton(CreateWorkItemRelationUseCase);
  container.register('CreateWorkItemRelationUseCase', {
    useFactory: (c) => c.resolve(CreateWorkItemRelationUseCase),
  });
  container.registerSingleton(ListWorkItemRelationsUseCase);
  container.register('ListWorkItemRelationsUseCase', {
    useFactory: (c) => c.resolve(ListWorkItemRelationsUseCase),
  });
  container.registerSingleton(DeleteWorkItemRelationUseCase);
  container.register('DeleteWorkItemRelationUseCase', {
    useFactory: (c) => c.resolve(DeleteWorkItemRelationUseCase),
  });

  // ─── Labels (feature 087) ───────────────────────────────────────────────
  container.registerSingleton(ManageLabelsUseCase);
  container.register('ManageLabelsUseCase', { useFactory: (c) => c.resolve(ManageLabelsUseCase) });

  // ─── Cycles (feature 087) ───────────────────────────────────────────────
  container.registerSingleton(ListCyclesUseCase);
  container.register('ListCyclesUseCase', { useFactory: (c) => c.resolve(ListCyclesUseCase) });
  container.registerSingleton(CreateCycleUseCase);
  container.register('CreateCycleUseCase', { useFactory: (c) => c.resolve(CreateCycleUseCase) });
  container.registerSingleton(UpdateCycleUseCase);
  container.register('UpdateCycleUseCase', { useFactory: (c) => c.resolve(UpdateCycleUseCase) });
  container.registerSingleton(DeleteCycleUseCase);
  container.register('DeleteCycleUseCase', { useFactory: (c) => c.resolve(DeleteCycleUseCase) });
  container.registerSingleton(AddItemsToCycleUseCase);
  container.register('AddItemsToCycleUseCase', {
    useFactory: (c) => c.resolve(AddItemsToCycleUseCase),
  });
  container.registerSingleton(RemoveItemsFromCycleUseCase);
  container.register('RemoveItemsFromCycleUseCase', {
    useFactory: (c) => c.resolve(RemoveItemsFromCycleUseCase),
  });
  container.registerSingleton(TransferCycleItemsUseCase);
  container.register('TransferCycleItemsUseCase', {
    useFactory: (c) => c.resolve(TransferCycleItemsUseCase),
  });

  // ─── Modules (feature 087) ──────────────────────────────────────────────
  container.registerSingleton(ListModulesUseCase);
  container.register('ListModulesUseCase', { useFactory: (c) => c.resolve(ListModulesUseCase) });
  container.registerSingleton(CreateModuleUseCase);
  container.register('CreateModuleUseCase', { useFactory: (c) => c.resolve(CreateModuleUseCase) });
  container.registerSingleton(UpdateModuleUseCase);
  container.register('UpdateModuleUseCase', { useFactory: (c) => c.resolve(UpdateModuleUseCase) });
  container.registerSingleton(DeleteModuleUseCase);
  container.register('DeleteModuleUseCase', { useFactory: (c) => c.resolve(DeleteModuleUseCase) });
  container.registerSingleton(AddItemsToModuleUseCase);
  container.register('AddItemsToModuleUseCase', {
    useFactory: (c) => c.resolve(AddItemsToModuleUseCase),
  });
  container.registerSingleton(RemoveItemsFromModuleUseCase);
  container.register('RemoveItemsFromModuleUseCase', {
    useFactory: (c) => c.resolve(RemoveItemsFromModuleUseCase),
  });

  // ─── Epics (feature 087) ────────────────────────────────────────────────
  container.registerSingleton(ListEpicsUseCase);
  container.register('ListEpicsUseCase', { useFactory: (c) => c.resolve(ListEpicsUseCase) });
  container.registerSingleton(CreateEpicUseCase);
  container.register('CreateEpicUseCase', { useFactory: (c) => c.resolve(CreateEpicUseCase) });
  container.registerSingleton(UpdateEpicUseCase);
  container.register('UpdateEpicUseCase', { useFactory: (c) => c.resolve(UpdateEpicUseCase) });
  container.registerSingleton(DeleteEpicUseCase);
  container.register('DeleteEpicUseCase', { useFactory: (c) => c.resolve(DeleteEpicUseCase) });

  // ─── Pages (feature 087) ────────────────────────────────────────────────
  container.registerSingleton(ListPagesUseCase);
  container.register('ListPagesUseCase', { useFactory: (c) => c.resolve(ListPagesUseCase) });
  container.registerSingleton(CreatePageUseCase);
  container.register('CreatePageUseCase', { useFactory: (c) => c.resolve(CreatePageUseCase) });
  container.registerSingleton(GetPageUseCase);
  container.register('GetPageUseCase', { useFactory: (c) => c.resolve(GetPageUseCase) });
  container.registerSingleton(UpdatePageUseCase);
  container.register('UpdatePageUseCase', { useFactory: (c) => c.resolve(UpdatePageUseCase) });
  container.registerSingleton(DeletePageUseCase);
  container.register('DeletePageUseCase', { useFactory: (c) => c.resolve(DeletePageUseCase) });

  // ─── Attachments (feature 087) ──────────────────────────────────────────
  container.registerSingleton(ListAttachmentsUseCase);
  container.register('ListAttachmentsUseCase', {
    useFactory: (c) => c.resolve(ListAttachmentsUseCase),
  });
  container.registerSingleton(UploadAttachmentUseCase);
  container.register('UploadAttachmentUseCase', {
    useFactory: (c) => c.resolve(UploadAttachmentUseCase),
  });
  container.registerSingleton(DeleteAttachmentUseCase);
  container.register('DeleteAttachmentUseCase', {
    useFactory: (c) => c.resolve(DeleteAttachmentUseCase),
  });

  // ─── Time Entries (feature 087) ─────────────────────────────────────────
  container.registerSingleton(ListTimeEntriesUseCase);
  container.register('ListTimeEntriesUseCase', {
    useFactory: (c) => c.resolve(ListTimeEntriesUseCase),
  });
  container.registerSingleton(LogTimeEntryUseCase);
  container.register('LogTimeEntryUseCase', { useFactory: (c) => c.resolve(LogTimeEntryUseCase) });
  container.registerSingleton(DeleteTimeEntryUseCase);
  container.register('DeleteTimeEntryUseCase', {
    useFactory: (c) => c.resolve(DeleteTimeEntryUseCase),
  });

  // ─── Comments (feature 087) ─────────────────────────────────────────────
  container.registerSingleton(ManageCommentsUseCase);
  container.register('ManageCommentsUseCase', {
    useFactory: (c) => c.resolve(ManageCommentsUseCase),
  });

  // ─── Saved Views (feature 087) ──────────────────────────────────────────
  container.registerSingleton(ManageSavedViewsUseCase);
  container.register('ManageSavedViewsUseCase', {
    useFactory: (c) => c.resolve(ManageSavedViewsUseCase),
  });

  // ─── Custom Properties (feature 087) ────────────────────────────────────
  container.registerSingleton(ManageCustomPropertiesUseCase);
  container.register('ManageCustomPropertiesUseCase', {
    useFactory: (c) => c.resolve(ManageCustomPropertiesUseCase),
  });

  // ─── Activity Log (feature 087) ─────────────────────────────────────────
  container.registerSingleton(ListActivityLogUseCase);
  container.register('ListActivityLogUseCase', {
    useFactory: (c) => c.resolve(ListActivityLogUseCase),
  });

  // ─── Notifications (feature 087) ────────────────────────────────────────
  container.registerSingleton(ListNotificationsUseCase);
  container.register('ListNotificationsUseCase', {
    useFactory: (c) => c.resolve(ListNotificationsUseCase),
  });
  container.registerSingleton(MarkNotificationReadUseCase);
  container.register('MarkNotificationReadUseCase', {
    useFactory: (c) => c.resolve(MarkNotificationReadUseCase),
  });

  // ─── Project Members (feature 087) ──────────────────────────────────────
  container.registerSingleton(AddProjectMemberUseCase);
  container.register('AddProjectMemberUseCase', {
    useFactory: (c) => c.resolve(AddProjectMemberUseCase),
  });
  container.registerSingleton(ListProjectMembersUseCase);
  container.register('ListProjectMembersUseCase', {
    useFactory: (c) => c.resolve(ListProjectMembersUseCase),
  });
  container.registerSingleton(RemoveProjectMemberUseCase);
  container.register('RemoveProjectMemberUseCase', {
    useFactory: (c) => c.resolve(RemoveProjectMemberUseCase),
  });
  container.registerSingleton(UpdateProjectMemberRoleUseCase);
  container.register('UpdateProjectMemberRoleUseCase', {
    useFactory: (c) => c.resolve(UpdateProjectMemberRoleUseCase),
  });

  // ─── Analytics (feature 087) ────────────────────────────────────────────
  container.registerSingleton(GetAiCycleSummaryUseCase);
  container.register('GetAiCycleSummaryUseCase', {
    useFactory: (c) => c.resolve(GetAiCycleSummaryUseCase),
  });
  container.registerSingleton(GetAiProjectHealthUseCase);
  container.register('GetAiProjectHealthUseCase', {
    useFactory: (c) => c.resolve(GetAiProjectHealthUseCase),
  });
  container.registerSingleton(GetCycleBurndownUseCase);
  container.register('GetCycleBurndownUseCase', {
    useFactory: (c) => c.resolve(GetCycleBurndownUseCase),
  });
  container.registerSingleton(GetModuleProgressUseCase);
  container.register('GetModuleProgressUseCase', {
    useFactory: (c) => c.resolve(GetModuleProgressUseCase),
  });
  container.registerSingleton(GetProjectBreakdownUseCase);
  container.register('GetProjectBreakdownUseCase', {
    useFactory: (c) => c.resolve(GetProjectBreakdownUseCase),
  });

  // ─── Intake (feature 087) ───────────────────────────────────────────────
  container.registerSingleton(ListIntakeItemsUseCase);
  container.register('ListIntakeItemsUseCase', {
    useFactory: (c) => c.resolve(ListIntakeItemsUseCase),
  });
  container.registerSingleton(CreateIntakeItemUseCase);
  container.register('CreateIntakeItemUseCase', {
    useFactory: (c) => c.resolve(CreateIntakeItemUseCase),
  });
  container.registerSingleton(AcceptIntakeItemUseCase);
  container.register('AcceptIntakeItemUseCase', {
    useFactory: (c) => c.resolve(AcceptIntakeItemUseCase),
  });
  container.registerSingleton(AutoTriageIntakeItemUseCase);
  container.register('AutoTriageIntakeItemUseCase', {
    useFactory: (c) => c.resolve(AutoTriageIntakeItemUseCase),
  });
  container.registerSingleton(DeclineIntakeItemUseCase);
  container.register('DeclineIntakeItemUseCase', {
    useFactory: (c) => c.resolve(DeclineIntakeItemUseCase),
  });
  container.registerSingleton(DetectDuplicatesUseCase);
  container.register('DetectDuplicatesUseCase', {
    useFactory: (c) => c.resolve(DetectDuplicatesUseCase),
  });

  // ─── Import/Export (feature 087) ────────────────────────────────────────
  container.registerSingleton(ExportWorkItemsCsvUseCase);
  container.register('ExportWorkItemsCsvUseCase', {
    useFactory: (c) => c.resolve(ExportWorkItemsCsvUseCase),
  });

  // ─── Global Search ───────────────────────────────────────────────────────
  container.registerSingleton(GlobalSearchUseCase);
  container.register('GlobalSearchUseCase', { useFactory: (c) => c.resolve(GlobalSearchUseCase) });
}
