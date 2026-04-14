/**
 * Dependency Injection Container
 *
 * Configures tsyringe DI container with all application dependencies.
 * Registers repository implementations, use cases, and services.
 *
 * Usage:
 * ```typescript
 * import { container } from './infrastructure/di/container.js';
 * const useCase = container.resolve(InitializeSettingsUseCase);
 * ```
 */

import 'reflect-metadata';
import { container } from 'tsyringe';
import type Database from 'better-sqlite3';
import nodePath from 'node:path';

// Repository interfaces and implementations
import type { ISettingsRepository } from '../../application/ports/output/repositories/settings.repository.interface.js';
import { SQLiteSettingsRepository } from '../repositories/sqlite-settings.repository.js';
import type { IFeatureRepository } from '../../application/ports/output/repositories/feature-repository.interface.js';
import { SQLiteFeatureRepository } from '../repositories/sqlite-feature.repository.js';
import type { IRepositoryRepository } from '../../application/ports/output/repositories/repository-repository.interface.js';
import { SQLiteRepositoryRepository } from '../repositories/sqlite-repository.repository.js';
import type { IApplicationRepository } from '../../application/ports/output/repositories/application-repository.interface.js';
import { SQLiteApplicationRepository } from '../repositories/sqlite-application.repository.js';
import type { IPmProjectRepository } from '../../application/ports/output/repositories/pm-project-repository.interface.js';
import { SQLitePmProjectRepository } from '../repositories/sqlite-pm-project.repository.js';
import type { IWorkItemRepository } from '../../application/ports/output/repositories/work-item-repository.interface.js';
import { SQLiteWorkItemRepository } from '../repositories/sqlite-work-item.repository.js';
import type { IWorkItemStateRepository } from '../../application/ports/output/repositories/work-item-state-repository.interface.js';
import { SQLiteWorkItemStateRepository } from '../repositories/sqlite-work-item-state.repository.js';
import type { ILabelRepository } from '../../application/ports/output/repositories/label-repository.interface.js';
import { SQLiteLabelRepository } from '../repositories/sqlite-label.repository.js';
import type { ICommentRepository } from '../../application/ports/output/repositories/comment-repository.interface.js';
import { SQLiteCommentRepository } from '../repositories/sqlite-comment.repository.js';
import type { ISavedViewRepository } from '../../application/ports/output/repositories/saved-view-repository.interface.js';
import { SQLiteSavedViewRepository } from '../repositories/sqlite-saved-view.repository.js';
import type { ICustomPropertyRepository } from '../../application/ports/output/repositories/custom-property-repository.interface.js';
import { SQLiteCustomPropertyRepository } from '../repositories/sqlite-custom-property.repository.js';
import type { IActivityLogRepository } from '../../application/ports/output/repositories/activity-log-repository.interface.js';
import { SQLiteActivityLogRepository } from '../repositories/sqlite-activity-log.repository.js';
import type { IWorkItemRelationRepository } from '../../application/ports/output/repositories/work-item-relation-repository.interface.js';
import { SQLiteWorkItemRelationRepository } from '../repositories/sqlite-work-item-relation.repository.js';
import type { ICycleRepository } from '../../application/ports/output/repositories/cycle-repository.interface.js';
import { SQLiteCycleRepository } from '../repositories/sqlite-cycle.repository.js';
import type { IPmModuleRepository } from '../../application/ports/output/repositories/pm-module-repository.interface.js';
import { SQLitePmModuleRepository } from '../repositories/sqlite-pm-module.repository.js';
import type { IPageRepository } from '../../application/ports/output/repositories/page-repository.interface.js';
import { SQLitePageRepository } from '../repositories/sqlite-page.repository.js';
import type { IPageVersionRepository } from '../../application/ports/output/repositories/page-version-repository.interface.js';
import { SQLitePageVersionRepository } from '../repositories/sqlite-page-version.repository.js';
import type { IEpicRepository } from '../../application/ports/output/repositories/epic-repository.interface.js';
import { SQLiteEpicRepository } from '../repositories/sqlite-epic.repository.js';
import type { IPmAttachmentRepository } from '../../application/ports/output/repositories/pm-attachment-repository.interface.js';
import { SQLitePmAttachmentRepository } from '../repositories/sqlite-pm-attachment.repository.js';
import type { ITimeEntryRepository } from '../../application/ports/output/repositories/time-entry-repository.interface.js';
import { SQLiteTimeEntryRepository } from '../repositories/sqlite-time-entry.repository.js';
import type { IIntakeItemRepository } from '../../application/ports/output/repositories/intake-item-repository.interface.js';
import { SQLiteIntakeItemRepository } from '../repositories/sqlite-intake-item.repository.js';
import type { INotificationRepository } from '../../application/ports/output/repositories/notification-repository.interface.js';
import { SQLiteNotificationRepository } from '../repositories/sqlite-notification.repository.js';
import type { IPmUserRepository } from '../../application/ports/output/repositories/pm-user-repository.interface.js';
import { SQLitePmUserRepository } from '../repositories/sqlite-pm-user.repository.js';
import type { IPmSessionRepository } from '../../application/ports/output/repositories/pm-session-repository.interface.js';
import { SQLitePmSessionRepository } from '../repositories/sqlite-pm-session.repository.js';
import type { IPmProjectMemberRepository } from '../../application/ports/output/repositories/pm-project-member-repository.interface.js';
import { SQLitePmProjectMemberRepository } from '../repositories/sqlite-pm-project-member.repository.js';
import type { IPmAuditLogRepository } from '../../application/ports/output/repositories/pm-audit-log-repository.interface.js';
import { SQLitePmAuditLogRepository } from '../repositories/sqlite-pm-audit-log.repository.js';

// Attachment storage and integration services
import type { IAttachmentStorage } from '../../application/ports/output/services/attachment-storage.interface.js';
import { LocalAttachmentStorageService } from '../services/storage/local-attachment-storage.service.js';
import type { IWebhookService } from '../../application/ports/output/services/webhook.interface.js';
import { NoopWebhookService } from '../services/integrations/noop-webhook.service.js';

// Validator interfaces and implementations
import type { IAgentValidator } from '../../application/ports/output/agents/agent-validator.interface.js';
import { AgentValidatorService } from '../services/agents/common/agent-validator.service.js';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import { IS_WINDOWS } from '../platform.js';

// Service interfaces and implementations
import type { IVersionService } from '../../application/ports/output/services/version-service.interface.js';
import { VersionService } from '../services/version.service.js';
import type { IWebServerService } from '../../application/ports/output/services/web-server-service.interface.js';
import type { IWorktreeService } from '../../application/ports/output/services/worktree-service.interface.js';
import { WorktreeService } from '../services/git/worktree.service.js';
import type { IFileSystemService } from '../../application/ports/output/services/file-system-service.interface.js';
import { FileSystemService } from '../services/file-system.service.js';
import type { IApplicationBriefStore } from '../../application/ports/output/services/application-brief-store.interface.js';
import { ApplicationBriefStore } from '../services/filesystem/application-brief.store.js';
import type { IProjectScaffoldService } from '../../application/ports/output/services/project-scaffold-service.interface.js';
import { FsProjectScaffoldService } from '../services/project-scaffold/fs-project-scaffold.service.js';
import type { IApplicationCreationPromptBuilder } from '../../application/ports/output/services/application-creation-prompt-builder.interface.js';
import { ApplicationCreationPromptBuilder } from '../services/agents/application-creation/application-creation-prompt.builder.js';
import type { IAgentAuthDetectorService } from '../../application/ports/output/services/agent-auth-detector.interface.js';
import { PlatformAgentAuthDetectorService } from '../services/agent-auth-detector/platform-agent-auth-detector.service.js';
import type { IToolInstallerService } from '../../application/ports/output/services/tool-installer.service.js';
import { ToolInstallerServiceImpl } from '../services/tool-installer/tool-installer.service.js';
import type { IGitPrService } from '../../application/ports/output/services/git-pr-service.interface.js';
import { GitPrService } from '../services/git/git-pr.service.js';
import type { IGitForkService } from '../../application/ports/output/services/git-fork-service.interface.js';
import { GitForkService } from '../services/git/git-fork.service.js';
import type { ISkillInjectorService } from '../../application/ports/output/services/skill-injector.interface.js';
import { SkillInjectorService } from '../services/skill-injector.service.js';
import type { IIdeLauncherService } from '../../application/ports/output/services/ide-launcher-service.interface.js';
import { JsonDrivenIdeLauncherService } from '../services/ide-launchers/json-driven-ide-launcher.service.js';
import type { IDaemonService } from '../../application/ports/output/services/daemon-service.interface.js';
import { DaemonPidService } from '../services/daemon/daemon-pid.service.js';
import type { IDeploymentService } from '../../application/ports/output/services/deployment-service.interface.js';
import { DeploymentService } from '../services/deployment/deployment.service.js';
import type { IShepInstanceService } from '../../application/ports/output/services/shep-instance-service.interface.js';
import { ShepInstanceService } from '../services/shep-instance.service.js';
import { AttachmentStorageService } from '../services/attachment-storage.service.js';
import type { IGitHubRepositoryService } from '../../application/ports/output/services/github-repository-service.interface.js';
import { GitHubRepositoryService } from '../services/external/github-repository.service.js';
import type { IBrowserOpener } from '../../application/ports/output/services/i-browser-opener.js';
import { BrowserOpenerService } from '../services/browser-opener.service.js';
import type { ITerminalSessionService } from '../../application/ports/output/services/terminal-session-service.interface.js';
import { PtyTerminalSessionService } from '../services/terminal/pty-terminal-session.service.js';
import { CreateTerminalSessionUseCase } from '../../application/use-cases/terminal/create-terminal-session.use-case.js';
import type { IApplicationFileSystemService } from '../../application/ports/output/services/application-file-system-service.interface.js';
import { NodeApplicationFileSystemService } from '../services/filesystem/node-application-file-system.service.js';
import { ListApplicationFilesUseCase } from '../../application/use-cases/applications/list-application-files.use-case.js';
import { ReadApplicationFileUseCase } from '../../application/use-cases/applications/read-application-file.use-case.js';
import { ReadApplicationFileRawUseCase } from '../../application/use-cases/applications/read-application-file-raw.use-case.js';
import { WriteApplicationFileUseCase } from '../../application/use-cases/applications/write-application-file.use-case.js';
import { WatchApplicationFilesUseCase } from '../../application/use-cases/applications/watch-application-files.use-case.js';

// Agent infrastructure interfaces and implementations
import type { IAgentExecutorFactory } from '../../application/ports/output/agents/agent-executor-factory.interface.js';
import type { IAgentExecutorProvider } from '../../application/ports/output/agents/agent-executor-provider.interface.js';
import type { IStructuredAgentCaller } from '../../application/ports/output/agents/structured-agent-caller.interface.js';
import type { IAgentRegistry } from '../../application/ports/output/agents/agent-registry.interface.js';
import type { IAgentRunner } from '../../application/ports/output/agents/agent-runner.interface.js';
import type { IAgentRunRepository } from '../../application/ports/output/agents/agent-run-repository.interface.js';
import type { IPhaseTimingRepository } from '../../application/ports/output/agents/phase-timing-repository.interface.js';
import type { IFeatureAgentProcessService } from '../../application/ports/output/agents/feature-agent-process.interface.js';
import type { ISpecInitializerService } from '../../application/ports/output/services/spec-initializer.interface.js';
import type { INotificationService } from '../../application/ports/output/services/notification-service.interface.js';
import { AgentExecutorFactory } from '../services/agents/common/agent-executor-factory.service.js';
import { AgentExecutorProvider } from '../services/agents/common/agent-executor-provider.service.js';
import { StructuredAgentCallerService } from '../services/agents/common/structured-agent-caller.service.js';
import { MockAgentExecutorFactory } from '../services/agents/common/executors/mock-executor-factory.service.js';
import { AgentRegistryService } from '../services/agents/common/agent-registry.service.js';
import { AgentRunnerService } from '../services/agents/common/agent-runner.service.js';
import { SQLiteAgentRunRepository } from '../repositories/agent-run.repository.js';
import { SQLitePhaseTimingRepository } from '../repositories/sqlite-phase-timing.repository.js';
import { FeatureAgentProcessService } from '../services/agents/feature-agent/feature-agent-process.service.js';
import { SpecInitializerService } from '../services/spec/spec-initializer.service.js';
import { DesktopNotifier } from '../services/notifications/desktop-notifier.js';
import { NotificationService } from '../services/notifications/notification.service.js';
import { getNotificationBus } from '../services/notifications/notification-bus.js';
import { spawn } from 'node:child_process';

// Use cases
import { InitializeSettingsUseCase } from '../../application/use-cases/settings/initialize-settings.use-case.js';
import { LoadSettingsUseCase } from '../../application/use-cases/settings/load-settings.use-case.js';
import { UpdateSettingsUseCase } from '../../application/use-cases/settings/update-settings.use-case.js';
import { CompleteOnboardingUseCase } from '../../application/use-cases/settings/complete-onboarding.use-case.js';
import { CompleteWebOnboardingUseCase } from '../../application/use-cases/settings/complete-web-onboarding.use-case.js';
import { ConfigureAgentUseCase } from '../../application/use-cases/agents/configure-agent.use-case.js';
import { ValidateAgentAuthUseCase } from '../../application/use-cases/agents/validate-agent-auth.use-case.js';
import { RunAgentUseCase } from '../../application/use-cases/agents/run-agent.use-case.js';
import { GetAgentRunUseCase } from '../../application/use-cases/agents/get-agent-run.use-case.js';
import { ListAgentRunsUseCase } from '../../application/use-cases/agents/list-agent-runs.use-case.js';
import { StopAgentRunUseCase } from '../../application/use-cases/agents/stop-agent-run.use-case.js';
import { DeleteAgentRunUseCase } from '../../application/use-cases/agents/delete-agent-run.use-case.js';
import { ApproveAgentRunUseCase } from '../../application/use-cases/agents/approve-agent-run.use-case.js';
import { RejectAgentRunUseCase } from '../../application/use-cases/agents/reject-agent-run.use-case.js';
import { ReviewFeatureUseCase } from '../../application/use-cases/agents/review-feature.use-case.js';
import { CreateFeatureUseCase } from '../../application/use-cases/features/create/create-feature.use-case.js';
import { MetadataGenerator } from '../../application/use-cases/features/create/metadata-generator.js';
import { SlugResolver } from '../../application/use-cases/features/create/slug-resolver.js';
import { ListFeaturesUseCase } from '../../application/use-cases/features/list-features.use-case.js';
import { ShowFeatureUseCase } from '../../application/use-cases/features/show-feature.use-case.js';
import { DeleteFeatureUseCase } from '../../application/use-cases/features/delete-feature.use-case.js';
import { ResumeFeatureUseCase } from '../../application/use-cases/features/resume-feature.use-case.js';
import { StartFeatureUseCase } from '../../application/use-cases/features/start-feature.use-case.js';
import { UpdateFeaturePinnedConfigUseCase } from '../../application/use-cases/features/update-feature-pinned-config.use-case.js';
import { AdoptBranchUseCase } from '../../application/use-cases/features/adopt-branch.use-case.js';
import { GetFeatureArtifactUseCase } from '../../application/use-cases/features/get-feature-artifact.use-case.js';
import { GetResearchArtifactUseCase } from '../../application/use-cases/features/get-research-artifact.use-case.js';
import { GetPlanArtifactUseCase } from '../../application/use-cases/features/get-plan-artifact.use-case.js';
import { ValidateToolAvailabilityUseCase } from '../../application/use-cases/tools/validate-tool-availability.use-case.js';
import { InstallToolUseCase } from '../../application/use-cases/tools/install-tool.use-case.js';
import { ListToolsUseCase } from '../../application/use-cases/tools/list-tools.use-case.js';
import { LaunchToolUseCase } from '../../application/use-cases/tools/launch-tool.use-case.js';
import { LaunchIdeUseCase } from '../../application/use-cases/ide/launch-ide.use-case.js';
import { AddRepositoryUseCase } from '../../application/use-cases/repositories/add-repository.use-case.js';
import { CreateProjectUseCase } from '../../application/use-cases/projects/create-project.use-case.js';
import { CheckAgentAuthUseCase } from '../../application/use-cases/agents/check-agent-auth.use-case.js';
import { ListRepositoriesUseCase } from '../../application/use-cases/repositories/list-repositories.use-case.js';
import { DeleteRepositoryUseCase } from '../../application/use-cases/repositories/delete-repository.use-case.js';
import { ImportGitHubRepositoryUseCase } from '../../application/use-cases/repositories/import-github-repository.use-case.js';
import { InitRemoteRepositoryUseCase } from '../../application/use-cases/repositories/init-remote-repository.use-case.js';
import { ListGitHubRepositoriesUseCase } from '../../application/use-cases/repositories/list-github-repositories.use-case.js';
import { ListGitHubOrganizationsUseCase } from '../../application/use-cases/repositories/list-github-organizations.use-case.js';
import { CreateFeatureFromRemoteUseCase } from '../../application/use-cases/features/create/create-feature-from-remote.use-case.js';
import { CheckAndUnblockFeaturesUseCase } from '../../application/use-cases/features/check-and-unblock-features.use-case.js';
import { UpdateFeatureLifecycleUseCase } from '../../application/use-cases/features/update/update-feature-lifecycle.use-case.js';
import { CleanupFeatureWorktreeUseCase } from '../../application/use-cases/features/cleanup-feature-worktree.use-case.js';
import { ArchiveFeatureUseCase } from '../../application/use-cases/features/archive-feature.use-case.js';
import { UnarchiveFeatureUseCase } from '../../application/use-cases/features/unarchive-feature.use-case.js';
import { UpgradeCliUseCase } from '../../application/use-cases/upgrade/upgrade-cli.use-case.js';
import { SyncRepositoryMainUseCase } from '../../application/use-cases/repositories/sync-repository-main.use-case.js';
import { RebaseFeatureOnMainUseCase } from '../../application/use-cases/features/rebase-feature-on-main.use-case.js';
import { GetBranchSyncStatusUseCase } from '../../application/use-cases/features/get-branch-sync-status.use-case.js';
import { ConflictResolutionService } from '../services/agents/conflict-resolution/conflict-resolution.service.js';
import { AutoResolveMergedBranchesUseCase } from '../../application/use-cases/features/auto-resolve-merged-branches.use-case.js';
import { CreateApplicationUseCase } from '../../application/use-cases/applications/create-application.use-case.js';
import { ListApplicationsUseCase } from '../../application/use-cases/applications/list-applications.use-case.js';
import { GetApplicationUseCase } from '../../application/use-cases/applications/get-application.use-case.js';
import { DeleteApplicationUseCase } from '../../application/use-cases/applications/delete-application.use-case.js';
import { ResumeApplicationWorkflowUseCase } from '../../application/use-cases/applications/resume-application-workflow.use-case.js';
import { UpdateApplicationUseCase } from '../../application/use-cases/applications/update-application.use-case.js';

// PM use cases
import { CreatePmProjectUseCase } from '../../application/use-cases/pm-projects/create-pm-project.use-case.js';
import { ListPmProjectsUseCase } from '../../application/use-cases/pm-projects/list-pm-projects.use-case.js';
import { GetPmProjectUseCase } from '../../application/use-cases/pm-projects/get-pm-project.use-case.js';
import { UpdatePmProjectUseCase } from '../../application/use-cases/pm-projects/update-pm-project.use-case.js';
import { DeletePmProjectUseCase } from '../../application/use-cases/pm-projects/delete-pm-project.use-case.js';
import { CreateWorkItemUseCase } from '../../application/use-cases/work-items/create-work-item.use-case.js';
import { ListWorkItemsUseCase } from '../../application/use-cases/work-items/list-work-items.use-case.js';
import { GetWorkItemUseCase } from '../../application/use-cases/work-items/get-work-item.use-case.js';
import { UpdateWorkItemUseCase } from '../../application/use-cases/work-items/update-work-item.use-case.js';
import { DeleteWorkItemUseCase } from '../../application/use-cases/work-items/delete-work-item.use-case.js';
import { ManageWorkItemStatesUseCase } from '../../application/use-cases/work-item-states/manage-work-item-states.use-case.js';
import { ManageLabelsUseCase } from '../../application/use-cases/labels/manage-labels.use-case.js';
import { ManageCommentsUseCase } from '../../application/use-cases/comments/manage-comments.use-case.js';
import { ManageSavedViewsUseCase } from '../../application/use-cases/saved-views/manage-saved-views.use-case.js';
import { ManageCustomPropertiesUseCase } from '../../application/use-cases/custom-properties/manage-custom-properties.use-case.js';
import { ListActivityLogUseCase } from '../../application/use-cases/activity-log/list-activity-log.use-case.js';
import { GlobalSearchUseCase } from '../../application/use-cases/search/global-search.use-case.js';
import { CreateWorkItemRelationUseCase } from '../../application/use-cases/work-item-relations/create-work-item-relation.use-case.js';
import { DeleteWorkItemRelationUseCase } from '../../application/use-cases/work-item-relations/delete-work-item-relation.use-case.js';
import { ListWorkItemRelationsUseCase } from '../../application/use-cases/work-item-relations/list-work-item-relations.use-case.js';
import { BulkUpdateWorkItemsUseCase } from '../../application/use-cases/work-items/bulk-update-work-items.use-case.js';

// Cycle use cases
import { CreateCycleUseCase } from '../../application/use-cases/cycles/create-cycle.use-case.js';
import { ListCyclesUseCase } from '../../application/use-cases/cycles/list-cycles.use-case.js';
import { GetCycleUseCase } from '../../application/use-cases/cycles/get-cycle.use-case.js';
import { UpdateCycleUseCase } from '../../application/use-cases/cycles/update-cycle.use-case.js';
import { DeleteCycleUseCase } from '../../application/use-cases/cycles/delete-cycle.use-case.js';
import { AddItemsToCycleUseCase } from '../../application/use-cases/cycles/add-items-to-cycle.use-case.js';
import { RemoveItemsFromCycleUseCase } from '../../application/use-cases/cycles/remove-items-from-cycle.use-case.js';
import { TransferCycleItemsUseCase } from '../../application/use-cases/cycles/transfer-cycle-items.use-case.js';

// Module use cases
import { CreateModuleUseCase } from '../../application/use-cases/modules/create-module.use-case.js';
import { ListModulesUseCase } from '../../application/use-cases/modules/list-modules.use-case.js';
import { GetModuleUseCase } from '../../application/use-cases/modules/get-module.use-case.js';
import { UpdateModuleUseCase } from '../../application/use-cases/modules/update-module.use-case.js';
import { DeleteModuleUseCase } from '../../application/use-cases/modules/delete-module.use-case.js';
import { AddItemsToModuleUseCase } from '../../application/use-cases/modules/add-items-to-module.use-case.js';
import { RemoveItemsFromModuleUseCase } from '../../application/use-cases/modules/remove-items-from-module.use-case.js';

// Page use cases
import { CreatePageUseCase } from '../../application/use-cases/pages/create-page.use-case.js';
import { ListPagesUseCase } from '../../application/use-cases/pages/list-pages.use-case.js';
import { GetPageUseCase } from '../../application/use-cases/pages/get-page.use-case.js';
import { UpdatePageUseCase } from '../../application/use-cases/pages/update-page.use-case.js';
import { DeletePageUseCase } from '../../application/use-cases/pages/delete-page.use-case.js';

// Attachment use cases
import { UploadAttachmentUseCase } from '../../application/use-cases/pm-attachments/upload-attachment.use-case.js';
import { ListAttachmentsUseCase } from '../../application/use-cases/pm-attachments/list-attachments.use-case.js';
import { DeleteAttachmentUseCase } from '../../application/use-cases/pm-attachments/delete-attachment.use-case.js';

// Epic use cases
import { CreateEpicUseCase } from '../../application/use-cases/epics/create-epic.use-case.js';
import { ListEpicsUseCase } from '../../application/use-cases/epics/list-epics.use-case.js';
import { UpdateEpicUseCase } from '../../application/use-cases/epics/update-epic.use-case.js';
import { DeleteEpicUseCase } from '../../application/use-cases/epics/delete-epic.use-case.js';

// Time entry use cases
import { LogTimeEntryUseCase } from '../../application/use-cases/time-entries/log-time-entry.use-case.js';
import { ListTimeEntriesUseCase } from '../../application/use-cases/time-entries/list-time-entries.use-case.js';
import { DeleteTimeEntryUseCase } from '../../application/use-cases/time-entries/delete-time-entry.use-case.js';

// Intake use cases
import { CreateIntakeItemUseCase } from '../../application/use-cases/intake/create-intake-item.use-case.js';
import { ListIntakeItemsUseCase } from '../../application/use-cases/intake/list-intake-items.use-case.js';
import { AcceptIntakeItemUseCase } from '../../application/use-cases/intake/accept-intake-item.use-case.js';
import { DeclineIntakeItemUseCase } from '../../application/use-cases/intake/decline-intake-item.use-case.js';
import { AutoTriageIntakeItemUseCase } from '../../application/use-cases/intake/auto-triage-intake-item.use-case.js';
import { DetectDuplicatesUseCase } from '../../application/use-cases/intake/detect-duplicates.use-case.js';

// Notification use cases
import { ListNotificationsUseCase } from '../../application/use-cases/notifications/list-notifications.use-case.js';
import { MarkNotificationReadUseCase } from '../../application/use-cases/notifications/mark-notification-read.use-case.js';

// Import/Export use cases
import { ExportWorkItemsCsvUseCase } from '../../application/use-cases/import-export/export-work-items-csv.use-case.js';
import { ImportWorkItemsCsvUseCase } from '../../application/use-cases/import-export/import-work-items-csv.use-case.js';

// Auth use cases
import { RegisterUserUseCase } from '../../application/use-cases/auth/register-user.use-case.js';
import { LoginUserUseCase } from '../../application/use-cases/auth/login-user.use-case.js';
import { LogoutUserUseCase } from '../../application/use-cases/auth/logout-user.use-case.js';
import { ValidateSessionUseCase } from '../../application/use-cases/auth/validate-session.use-case.js';

// Project member use cases
import { AddProjectMemberUseCase } from '../../application/use-cases/project-members/add-project-member.use-case.js';
import { RemoveProjectMemberUseCase } from '../../application/use-cases/project-members/remove-project-member.use-case.js';
import { UpdateProjectMemberRoleUseCase } from '../../application/use-cases/project-members/update-project-member-role.use-case.js';
import { ListProjectMembersUseCase } from '../../application/use-cases/project-members/list-project-members.use-case.js';

// Audit use cases
import { CreateAuditLogUseCase } from '../../application/use-cases/audit/create-audit-log.use-case.js';
import { ListAuditLogsUseCase } from '../../application/use-cases/audit/list-audit-logs.use-case.js';
import { SendWebhookUseCase } from '../../application/use-cases/integrations/send-webhook.use-case.js';

// Analytics use cases
import { GetCycleBurndownUseCase } from '../../application/use-cases/analytics/get-cycle-burndown.use-case.js';
import { GetProjectBreakdownUseCase } from '../../application/use-cases/analytics/get-project-breakdown.use-case.js';
import { GetModuleProgressUseCase } from '../../application/use-cases/analytics/get-module-progress.use-case.js';
import { GetAiCycleSummaryUseCase } from '../../application/use-cases/analytics/get-ai-cycle-summary.use-case.js';
import { GetAiProjectHealthUseCase } from '../../application/use-cases/analytics/get-ai-project-health.use-case.js';

// Deployment use cases
import { StartFeatureDeploymentUseCase } from '../../application/use-cases/deployments/start-feature-deployment.use-case.js';
import { StartRepositoryDeploymentUseCase } from '../../application/use-cases/deployments/start-repository-deployment.use-case.js';
import { StopDeploymentUseCase } from '../../application/use-cases/deployments/stop-deployment.use-case.js';
import { GetDeploymentStatusUseCase } from '../../application/use-cases/deployments/get-deployment-status.use-case.js';
import { ListDeploymentsUseCase } from '../../application/use-cases/deployments/list-deployments.use-case.js';

// Interactive session use cases
import { StartInteractiveSessionUseCase } from '../../application/use-cases/interactive/start-interactive-session.use-case.js';
import { SendInteractiveMessageUseCase } from '../../application/use-cases/interactive/send-interactive-message.use-case.js';
import { StopInteractiveSessionUseCase } from '../../application/use-cases/interactive/stop-interactive-session.use-case.js';
import { GetInteractiveChatStateUseCase } from '../../application/use-cases/interactive/get-interactive-chat-state.use-case.js';
import { RespondToInteractionUseCase } from '../../application/use-cases/interactive/respond-to-interaction.use-case.js';

// Session listing
import { ClaudeCodeSessionRepository } from '../services/agents/sessions/claude-code-session.repository.js';
import { CodexCliSessionRepository } from '../services/agents/sessions/codex-cli-session.repository.js';
import { StubSessionRepository } from '../services/agents/sessions/stub-session.repository.js';
import { AgentSessionRepositoryRegistry } from '../../application/services/agents/agent-session-repository.registry.js';
import { ListAgentSessionsUseCase } from '../../application/use-cases/agents/list-agent-sessions.use-case.js';
import { GetAgentSessionUseCase } from '../../application/use-cases/agents/get-agent-session.use-case.js';
import { AgentType } from '../../domain/generated/output.js';

// Database connection
import { getSQLiteConnection } from '../persistence/sqlite/connection.js';
import { runSQLiteMigrations } from '../persistence/sqlite/migrations.js';

// Interactive session infrastructure
import type { IInteractiveSessionRepository } from '../../application/ports/output/repositories/interactive-session-repository.interface.js';
import type { IInteractiveMessageRepository } from '../../application/ports/output/repositories/interactive-message-repository.interface.js';
import type { IInteractiveSessionService } from '../../application/ports/output/services/interactive-session-service.interface.js';
import type { IWorkflowStepRepository } from '../../application/ports/output/repositories/workflow-step-repository.interface.js';
import { SQLiteInteractiveSessionRepository } from '../repositories/sqlite-interactive-session.repository.js';
import { SQLiteInteractiveMessageRepository } from '../repositories/sqlite-interactive-message.repository.js';
import { SQLiteWorkflowStepRepository } from '../repositories/sqlite-workflow-step.repository.js';
import { InteractiveSessionService } from '../services/interactive/interactive-session.service.js';
import { FeatureContextBuilder } from '../services/interactive/feature-context.builder.js';
import { RunWorkflowUseCase } from '../../application/use-cases/workflows/run-workflow.use-case.js';

let _initialized = false;

/**
 * Initialize the DI container with all dependencies.
 * Must be called before resolving any dependencies.
 * Safe to call multiple times — returns existing container if already initialized.
 *
 * @returns Configured container instance
 */
export async function initializeContainer(): Promise<typeof container> {
  if (_initialized) {
    return container;
  }

  // Get database connection
  const db = await getSQLiteConnection();

  // Run migrations
  await runSQLiteMigrations(db);

  // Register database instance
  container.registerInstance<Database.Database>('Database', db);

  // Register repositories
  container.register<ISettingsRepository>('ISettingsRepository', {
    useFactory: (c) => {
      const database = c.resolve<Database.Database>('Database');
      return new SQLiteSettingsRepository(database);
    },
  });

  container.register<IFeatureRepository>('IFeatureRepository', {
    useFactory: (c) => {
      const database = c.resolve<Database.Database>('Database');
      return new SQLiteFeatureRepository(database);
    },
  });

  container.register<IRepositoryRepository>('IRepositoryRepository', {
    useFactory: (c) => {
      const database = c.resolve<Database.Database>('Database');
      return new SQLiteRepositoryRepository(database);
    },
  });

  container.register<IApplicationRepository>('IApplicationRepository', {
    useFactory: (c) => {
      const database = c.resolve<Database.Database>('Database');
      return new SQLiteApplicationRepository(database);
    },
  });

  // PM repositories
  container.register<IPmProjectRepository>('IPmProjectRepository', {
    useFactory: (c) => {
      const database = c.resolve<Database.Database>('Database');
      return new SQLitePmProjectRepository(database);
    },
  });

  container.register<IWorkItemRepository>('IWorkItemRepository', {
    useFactory: (c) => {
      const database = c.resolve<Database.Database>('Database');
      return new SQLiteWorkItemRepository(database);
    },
  });

  container.register<IWorkItemStateRepository>('IWorkItemStateRepository', {
    useFactory: (c) => {
      const database = c.resolve<Database.Database>('Database');
      return new SQLiteWorkItemStateRepository(database);
    },
  });

  container.register<ILabelRepository>('ILabelRepository', {
    useFactory: (c) => {
      const database = c.resolve<Database.Database>('Database');
      return new SQLiteLabelRepository(database);
    },
  });

  container.register<ICommentRepository>('ICommentRepository', {
    useFactory: (c) => {
      const database = c.resolve<Database.Database>('Database');
      return new SQLiteCommentRepository(database);
    },
  });

  container.register<ISavedViewRepository>('ISavedViewRepository', {
    useFactory: (c) => {
      const database = c.resolve<Database.Database>('Database');
      return new SQLiteSavedViewRepository(database);
    },
  });

  container.register<ICustomPropertyRepository>('ICustomPropertyRepository', {
    useFactory: (c) => {
      const database = c.resolve<Database.Database>('Database');
      return new SQLiteCustomPropertyRepository(database);
    },
  });

  container.register<IActivityLogRepository>('IActivityLogRepository', {
    useFactory: (c) => {
      const database = c.resolve<Database.Database>('Database');
      return new SQLiteActivityLogRepository(database);
    },
  });

  container.register<IWorkItemRelationRepository>('IWorkItemRelationRepository', {
    useFactory: (c) => {
      const database = c.resolve<Database.Database>('Database');
      return new SQLiteWorkItemRelationRepository(database);
    },
  });

  container.register<ICycleRepository>('ICycleRepository', {
    useFactory: (c) => {
      const database = c.resolve<Database.Database>('Database');
      return new SQLiteCycleRepository(database);
    },
  });

  container.register<IPmModuleRepository>('IPmModuleRepository', {
    useFactory: (c) => {
      const database = c.resolve<Database.Database>('Database');
      return new SQLitePmModuleRepository(database);
    },
  });

  container.register<IPageRepository>('IPageRepository', {
    useFactory: (c) => {
      const database = c.resolve<Database.Database>('Database');
      return new SQLitePageRepository(database);
    },
  });

  container.register<IPageVersionRepository>('IPageVersionRepository', {
    useFactory: (c) => {
      const database = c.resolve<Database.Database>('Database');
      return new SQLitePageVersionRepository(database);
    },
  });

  container.register<IEpicRepository>('IEpicRepository', {
    useFactory: (c) => {
      const database = c.resolve<Database.Database>('Database');
      return new SQLiteEpicRepository(database);
    },
  });

  container.register<IPmAttachmentRepository>('IPmAttachmentRepository', {
    useFactory: (c) => {
      const database = c.resolve<Database.Database>('Database');
      return new SQLitePmAttachmentRepository(database);
    },
  });

  container.register<ITimeEntryRepository>('ITimeEntryRepository', {
    useFactory: (c) => {
      const database = c.resolve<Database.Database>('Database');
      return new SQLiteTimeEntryRepository(database);
    },
  });

  container.register<IIntakeItemRepository>('IIntakeItemRepository', {
    useFactory: (c) => {
      const database = c.resolve<Database.Database>('Database');
      return new SQLiteIntakeItemRepository(database);
    },
  });

  container.register<INotificationRepository>('INotificationRepository', {
    useFactory: (c) => {
      const database = c.resolve<Database.Database>('Database');
      return new SQLiteNotificationRepository(database);
    },
  });

  container.register<IPmUserRepository>('IPmUserRepository', {
    useFactory: (c) => {
      const database = c.resolve<Database.Database>('Database');
      return new SQLitePmUserRepository(database);
    },
  });

  container.register<IPmSessionRepository>('IPmSessionRepository', {
    useFactory: (c) => {
      const database = c.resolve<Database.Database>('Database');
      return new SQLitePmSessionRepository(database);
    },
  });

  container.register<IPmProjectMemberRepository>('IPmProjectMemberRepository', {
    useFactory: (c) => {
      const database = c.resolve<Database.Database>('Database');
      return new SQLitePmProjectMemberRepository(database);
    },
  });

  container.register<IPmAuditLogRepository>('IPmAuditLogRepository', {
    useFactory: (c) => {
      const database = c.resolve<Database.Database>('Database');
      return new SQLitePmAuditLogRepository(database);
    },
  });

  // Register external dependencies as tokens
  // On Windows, agent CLIs ship as .cmd/.ps1 scripts (e.g. cursor's `agent.cmd`).
  // execFile without shell: true cannot resolve .cmd extensions, causing ENOENT.
  const execFileAsync = promisify(execFile);
  const execFn = IS_WINDOWS
    ? (file: string, args: string[], options?: object) =>
        execFileAsync(file, args, { ...options, shell: true, windowsHide: true })
    : execFileAsync;
  container.registerInstance('ExecFunction', execFn);

  // Register services (singletons via @injectable + token)
  container.registerSingleton<IAgentValidator>('IAgentValidator', AgentValidatorService);
  container.registerSingleton<IVersionService>('IVersionService', VersionService);
  // IWebServerService is registered as a lazy proxy to avoid importing `next`
  // (~80ms) for non-web commands. The actual service is loaded on first method call.
  container.register<IWebServerService>('IWebServerService', {
    useFactory: () => {
      let instance: IWebServerService | null = null;
      const getInstance = async (): Promise<IWebServerService> => {
        if (!instance) {
          const { WebServerService } = await import('../services/web-server.service.js');
          instance = new WebServerService();
        }
        return instance;
      };
      return new Proxy({} as IWebServerService, {
        get: (_target, prop) => {
          return async (...args: unknown[]) => {
            const svc = await getInstance();
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            return (svc as any)[prop](...args);
          };
        },
      });
    },
  });
  container.registerSingleton<IWorktreeService>('IWorktreeService', WorktreeService);
  container.registerSingleton<IFileSystemService>('IFileSystemService', FileSystemService);
  container.registerSingleton<IWebhookService>('IWebhookService', NoopWebhookService);

  // Attachment storage — derives path from database directory
  container.register<IAttachmentStorage>('IAttachmentStorage', {
    useFactory: () => {
      const dbFilename = db.name;
      const dbDir = dbFilename ? nodePath.dirname(dbFilename) : '.shep';
      const storagePath = nodePath.join(dbDir, 'attachments');
      return new LocalAttachmentStorageService(storagePath);
    },
  });
  container.registerSingleton<IApplicationBriefStore>(
    'IApplicationBriefStore',
    ApplicationBriefStore
  );
  container.registerSingleton<IProjectScaffoldService>(
    'IProjectScaffoldService',
    FsProjectScaffoldService
  );
  container.registerSingleton<IApplicationCreationPromptBuilder>(
    'IApplicationCreationPromptBuilder',
    ApplicationCreationPromptBuilder
  );
  container.registerSingleton<IAgentAuthDetectorService>(
    'IAgentAuthDetectorService',
    PlatformAgentAuthDetectorService
  );
  container.registerSingleton<ISkillInjectorService>('ISkillInjectorService', SkillInjectorService);
  container.registerSingleton<IToolInstallerService>(
    'IToolInstallerService',
    ToolInstallerServiceImpl
  );
  container.registerSingleton<IGitPrService>('IGitPrService', GitPrService);
  container.registerSingleton<IGitForkService>('IGitForkService', GitForkService);
  container.registerSingleton<IGitHubRepositoryService>(
    'IGitHubRepositoryService',
    GitHubRepositoryService
  );
  container.registerSingleton<IIdeLauncherService>(
    'IIdeLauncherService',
    JsonDrivenIdeLauncherService
  );
  container.registerSingleton<IDaemonService>('IDaemonService', DaemonPidService);
  container.registerSingleton<IApplicationFileSystemService>(
    'IApplicationFileSystemService',
    NodeApplicationFileSystemService
  );
  container.registerSingleton<ITerminalSessionService>(
    'ITerminalSessionService',
    PtyTerminalSessionService
  );
  container.registerSingleton(AttachmentStorageService);
  container.register('AttachmentStorageService', { useToken: AttachmentStorageService });
  const deploymentService = new DeploymentService();
  deploymentService.setDatabase(db);
  deploymentService.recoverAll();
  container.registerInstance<IDeploymentService>('IDeploymentService', deploymentService);
  container.registerSingleton<IShepInstanceService>('IShepInstanceService', ShepInstanceService);

  // Register agent infrastructure
  container.register<IAgentRunRepository>('IAgentRunRepository', {
    useFactory: (c) => {
      const database = c.resolve<Database.Database>('Database');
      return new SQLiteAgentRunRepository(database);
    },
  });

  container.register<IPhaseTimingRepository>('IPhaseTimingRepository', {
    useFactory: (c) => {
      const database = c.resolve<Database.Database>('Database');
      return new SQLitePhaseTimingRepository(database);
    },
  });

  if (process.env.SHEP_MOCK_EXECUTOR === '1') {
    container.register<IAgentExecutorFactory>('IAgentExecutorFactory', {
      useFactory: () => new MockAgentExecutorFactory(),
    });
  } else {
    container.register<IAgentExecutorFactory>('IAgentExecutorFactory', {
      useFactory: () => {
        // Wrap spawn with sensible defaults: stdio piped and windowsHide on Win32.
        // Each executor controls its own `shell` option — cursor needs shell: true
        // for .cmd scripts, but claude-code must NOT use shell (DEP0190 / prompt mangling).
        const spawnWithPipe = (command: string, args: string[], options?: object) => {
          return spawn(command, args, {
            stdio: 'pipe',
            ...(process.platform === 'win32' ? { windowsHide: true } : {}),
            ...options,
          });
        };
        return new AgentExecutorFactory(spawnWithPipe);
      },
    });
  }

  container.register<IAgentExecutorProvider>('IAgentExecutorProvider', {
    useFactory: (c) => {
      const factory = c.resolve<IAgentExecutorFactory>('IAgentExecutorFactory');
      const settingsRepo = c.resolve<ISettingsRepository>('ISettingsRepository');
      return new AgentExecutorProvider(factory, settingsRepo);
    },
  });

  container.register<IStructuredAgentCaller>('IStructuredAgentCaller', {
    useFactory: (c) => {
      const provider = c.resolve<IAgentExecutorProvider>('IAgentExecutorProvider');
      const factory = c.resolve<IAgentExecutorFactory>('IAgentExecutorFactory');
      return new StructuredAgentCallerService(provider, factory);
    },
  });

  container.register<IAgentRegistry>('IAgentRegistry', {
    useFactory: () => new AgentRegistryService(),
  });

  container.register<IAgentRunner>('IAgentRunner', {
    useFactory: (c) => {
      const registry = c.resolve<IAgentRegistry>('IAgentRegistry');
      const executorProvider = c.resolve<IAgentExecutorProvider>('IAgentExecutorProvider');
      const runRepository = c.resolve<IAgentRunRepository>('IAgentRunRepository');
      // Checkpointer is lazy-loaded to avoid ~240ms startup cost from
      // @langchain/langgraph-checkpoint-sqlite on every CLI invocation.
      return new AgentRunnerService(registry, executorProvider, runRepository);
    },
  });

  container.register<IFeatureAgentProcessService>('IFeatureAgentProcessService', {
    useFactory: (c) => {
      const runRepository = c.resolve<IAgentRunRepository>('IAgentRunRepository');
      return new FeatureAgentProcessService(runRepository);
    },
  });

  container.register<ISpecInitializerService>('ISpecInitializerService', {
    useFactory: () => new SpecInitializerService(),
  });

  // Register notification services
  const notificationBus = getNotificationBus();

  container.registerInstance('NotificationEventBus', notificationBus);

  container.register('DesktopNotifier', {
    useFactory: () => new DesktopNotifier(),
  });

  container.register<INotificationService>('INotificationService', {
    useFactory: (c) => {
      const bus = c.resolve('NotificationEventBus') as ReturnType<typeof getNotificationBus>;
      const desktopNotif = c.resolve('DesktopNotifier') as DesktopNotifier;
      return new NotificationService(bus, desktopNotif);
    },
  });

  // Register browser opener service
  container.register<IBrowserOpener>('IBrowserOpener', {
    useFactory: () => new BrowserOpenerService(),
  });

  // Register use cases (singletons for performance)
  container.registerSingleton(InitializeSettingsUseCase);
  container.registerSingleton(LoadSettingsUseCase);
  container.registerSingleton(UpdateSettingsUseCase);
  container.registerSingleton(CompleteOnboardingUseCase);
  container.registerSingleton(CompleteWebOnboardingUseCase);
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
  // CheckAndUnblockFeaturesUseCase must be registered before UpdateFeatureLifecycleUseCase
  // because the latter injects the former via class token.
  container.registerSingleton(CheckAndUnblockFeaturesUseCase);
  container.registerSingleton(UpdateFeatureLifecycleUseCase);
  container.registerSingleton(CleanupFeatureWorktreeUseCase);
  container.registerSingleton(ArchiveFeatureUseCase);
  container.registerSingleton(UnarchiveFeatureUseCase);
  container.registerSingleton(UpgradeCliUseCase);
  container.registerSingleton(ConflictResolutionService);
  container.register('ConflictResolutionService', {
    useFactory: (c) => c.resolve(ConflictResolutionService),
  });
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

  // Deployment use cases
  container.registerSingleton(StartFeatureDeploymentUseCase);
  container.registerSingleton(StartRepositoryDeploymentUseCase);
  container.registerSingleton(StopDeploymentUseCase);
  container.registerSingleton(GetDeploymentStatusUseCase);
  container.registerSingleton(ListDeploymentsUseCase);

  // PM use cases
  container.registerSingleton(CreatePmProjectUseCase);
  container.registerSingleton(ListPmProjectsUseCase);
  container.registerSingleton(GetPmProjectUseCase);
  container.registerSingleton(UpdatePmProjectUseCase);
  container.registerSingleton(DeletePmProjectUseCase);
  container.registerSingleton(CreateWorkItemUseCase);
  container.registerSingleton(ListWorkItemsUseCase);
  container.registerSingleton(GetWorkItemUseCase);
  container.registerSingleton(UpdateWorkItemUseCase);
  container.registerSingleton(DeleteWorkItemUseCase);
  container.registerSingleton(ManageWorkItemStatesUseCase);
  container.registerSingleton(ManageLabelsUseCase);
  container.registerSingleton(ManageCommentsUseCase);
  container.registerSingleton(ManageSavedViewsUseCase);
  container.registerSingleton(ManageCustomPropertiesUseCase);
  container.registerSingleton(ListActivityLogUseCase);
  container.registerSingleton(GlobalSearchUseCase);
  container.registerSingleton(CreateWorkItemRelationUseCase);
  container.registerSingleton(DeleteWorkItemRelationUseCase);
  container.registerSingleton(ListWorkItemRelationsUseCase);
  container.registerSingleton(BulkUpdateWorkItemsUseCase);

  // Cycle use cases
  container.registerSingleton(CreateCycleUseCase);
  container.registerSingleton(ListCyclesUseCase);
  container.registerSingleton(GetCycleUseCase);
  container.registerSingleton(UpdateCycleUseCase);
  container.registerSingleton(DeleteCycleUseCase);
  container.registerSingleton(AddItemsToCycleUseCase);
  container.registerSingleton(RemoveItemsFromCycleUseCase);
  container.registerSingleton(TransferCycleItemsUseCase);

  // Module use cases
  container.registerSingleton(CreateModuleUseCase);
  container.registerSingleton(ListModulesUseCase);
  container.registerSingleton(GetModuleUseCase);
  container.registerSingleton(UpdateModuleUseCase);
  container.registerSingleton(DeleteModuleUseCase);
  container.registerSingleton(AddItemsToModuleUseCase);
  container.registerSingleton(RemoveItemsFromModuleUseCase);

  // Page use cases
  container.registerSingleton(CreatePageUseCase);
  container.registerSingleton(ListPagesUseCase);
  container.registerSingleton(GetPageUseCase);
  container.registerSingleton(UpdatePageUseCase);
  container.registerSingleton(DeletePageUseCase);

  // Attachment use cases
  container.registerSingleton(UploadAttachmentUseCase);
  container.register('UploadAttachmentUseCase', { useToken: UploadAttachmentUseCase });
  container.registerSingleton(ListAttachmentsUseCase);
  container.register('ListAttachmentsUseCase', { useToken: ListAttachmentsUseCase });
  container.registerSingleton(DeleteAttachmentUseCase);
  container.register('DeleteAttachmentUseCase', { useToken: DeleteAttachmentUseCase });

  // Epic use cases
  container.registerSingleton(CreateEpicUseCase);
  container.register('CreateEpicUseCase', { useToken: CreateEpicUseCase });
  container.registerSingleton(ListEpicsUseCase);
  container.register('ListEpicsUseCase', { useToken: ListEpicsUseCase });
  container.registerSingleton(UpdateEpicUseCase);
  container.register('UpdateEpicUseCase', { useToken: UpdateEpicUseCase });
  container.registerSingleton(DeleteEpicUseCase);
  container.register('DeleteEpicUseCase', { useToken: DeleteEpicUseCase });

  // Time entry use cases
  container.registerSingleton(LogTimeEntryUseCase);
  container.register('LogTimeEntryUseCase', { useToken: LogTimeEntryUseCase });
  container.registerSingleton(ListTimeEntriesUseCase);
  container.register('ListTimeEntriesUseCase', { useToken: ListTimeEntriesUseCase });
  container.registerSingleton(DeleteTimeEntryUseCase);
  container.register('DeleteTimeEntryUseCase', { useToken: DeleteTimeEntryUseCase });

  // Intake use cases
  container.registerSingleton(CreateIntakeItemUseCase);
  container.register('CreateIntakeItemUseCase', { useToken: CreateIntakeItemUseCase });
  container.registerSingleton(ListIntakeItemsUseCase);
  container.register('ListIntakeItemsUseCase', { useToken: ListIntakeItemsUseCase });
  container.registerSingleton(AcceptIntakeItemUseCase);
  container.register('AcceptIntakeItemUseCase', { useToken: AcceptIntakeItemUseCase });
  container.registerSingleton(DeclineIntakeItemUseCase);
  container.register('DeclineIntakeItemUseCase', { useToken: DeclineIntakeItemUseCase });
  container.registerSingleton(AutoTriageIntakeItemUseCase);
  container.register('AutoTriageIntakeItemUseCase', { useToken: AutoTriageIntakeItemUseCase });
  container.registerSingleton(DetectDuplicatesUseCase);
  container.register('DetectDuplicatesUseCase', { useToken: DetectDuplicatesUseCase });

  // Notification use cases
  container.registerSingleton(ListNotificationsUseCase);
  container.register('ListNotificationsUseCase', { useToken: ListNotificationsUseCase });
  container.registerSingleton(MarkNotificationReadUseCase);
  container.register('MarkNotificationReadUseCase', { useToken: MarkNotificationReadUseCase });

  // Auth use cases
  container.registerSingleton(RegisterUserUseCase);
  container.register('RegisterUserUseCase', { useToken: RegisterUserUseCase });
  container.registerSingleton(LoginUserUseCase);
  container.register('LoginUserUseCase', { useToken: LoginUserUseCase });
  container.registerSingleton(LogoutUserUseCase);
  container.register('LogoutUserUseCase', { useToken: LogoutUserUseCase });
  container.registerSingleton(ValidateSessionUseCase);
  container.register('ValidateSessionUseCase', { useToken: ValidateSessionUseCase });

  // Project member use cases
  container.registerSingleton(AddProjectMemberUseCase);
  container.register('AddProjectMemberUseCase', { useToken: AddProjectMemberUseCase });
  container.registerSingleton(RemoveProjectMemberUseCase);
  container.register('RemoveProjectMemberUseCase', { useToken: RemoveProjectMemberUseCase });
  container.registerSingleton(UpdateProjectMemberRoleUseCase);
  container.register('UpdateProjectMemberRoleUseCase', {
    useToken: UpdateProjectMemberRoleUseCase,
  });
  container.registerSingleton(ListProjectMembersUseCase);
  container.register('ListProjectMembersUseCase', { useToken: ListProjectMembersUseCase });

  // Audit use cases
  container.registerSingleton(CreateAuditLogUseCase);
  container.register('CreateAuditLogUseCase', { useToken: CreateAuditLogUseCase });
  container.registerSingleton(ListAuditLogsUseCase);
  container.register('ListAuditLogsUseCase', { useToken: ListAuditLogsUseCase });

  // Integration use cases
  container.registerSingleton(SendWebhookUseCase);
  container.register('SendWebhookUseCase', { useToken: SendWebhookUseCase });

  // Import/Export use cases
  container.registerSingleton(ExportWorkItemsCsvUseCase);
  container.register('ExportWorkItemsCsvUseCase', { useToken: ExportWorkItemsCsvUseCase });
  container.registerSingleton(ImportWorkItemsCsvUseCase);
  container.register('ImportWorkItemsCsvUseCase', { useToken: ImportWorkItemsCsvUseCase });

  // Analytics use cases
  container.registerSingleton(GetCycleBurndownUseCase);
  container.registerSingleton(GetProjectBreakdownUseCase);
  container.registerSingleton(GetModuleProgressUseCase);
  container.registerSingleton(GetAiCycleSummaryUseCase);
  container.register('GetAiCycleSummaryUseCase', { useToken: GetAiCycleSummaryUseCase });
  container.registerSingleton(GetAiProjectHealthUseCase);
  container.register('GetAiProjectHealthUseCase', { useToken: GetAiProjectHealthUseCase });

  // Session repositories (per-AgentType string tokens)
  container.register(`IAgentSessionRepository:${AgentType.ClaudeCode}`, {
    useFactory: () => new ClaudeCodeSessionRepository(),
  });
  container.register(`IAgentSessionRepository:${AgentType.Cursor}`, {
    useFactory: () => new StubSessionRepository(AgentType.Cursor),
  });
  container.register(`IAgentSessionRepository:${AgentType.GeminiCli}`, {
    useFactory: () => new StubSessionRepository(AgentType.GeminiCli),
  });
  container.register(`IAgentSessionRepository:${AgentType.CodexCli}`, {
    useFactory: () => new CodexCliSessionRepository(),
  });
  container.register(`IAgentSessionRepository:${AgentType.CopilotCli}`, {
    useFactory: () => new StubSessionRepository(AgentType.CopilotCli),
  });

  container.registerSingleton(AgentSessionRepositoryRegistry);
  container.registerSingleton(ListAgentSessionsUseCase);
  container.registerSingleton(GetAgentSessionUseCase);

  // String-token aliases for web routes (Turbopack can't resolve .js→.ts
  // imports inside @shepai/core, so routes use string tokens instead of class refs)
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
  container.register('StartFeatureDeploymentUseCase', {
    useFactory: (c) => c.resolve(StartFeatureDeploymentUseCase),
  });
  container.register('StartRepositoryDeploymentUseCase', {
    useFactory: (c) => c.resolve(StartRepositoryDeploymentUseCase),
  });
  container.register('StopDeploymentUseCase', {
    useFactory: (c) => c.resolve(StopDeploymentUseCase),
  });
  container.register('GetDeploymentStatusUseCase', {
    useFactory: (c) => c.resolve(GetDeploymentStatusUseCase),
  });
  container.register('ListDeploymentsUseCase', {
    useFactory: (c) => c.resolve(ListDeploymentsUseCase),
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

  // PM use case string-token aliases for web routes
  container.register('CreatePmProjectUseCase', {
    useFactory: (c) => c.resolve(CreatePmProjectUseCase),
  });
  container.register('ListPmProjectsUseCase', {
    useFactory: (c) => c.resolve(ListPmProjectsUseCase),
  });
  container.register('GetPmProjectUseCase', {
    useFactory: (c) => c.resolve(GetPmProjectUseCase),
  });
  container.register('UpdatePmProjectUseCase', {
    useFactory: (c) => c.resolve(UpdatePmProjectUseCase),
  });
  container.register('DeletePmProjectUseCase', {
    useFactory: (c) => c.resolve(DeletePmProjectUseCase),
  });
  container.register('CreateWorkItemUseCase', {
    useFactory: (c) => c.resolve(CreateWorkItemUseCase),
  });
  container.register('ListWorkItemsUseCase', {
    useFactory: (c) => c.resolve(ListWorkItemsUseCase),
  });
  container.register('GetWorkItemUseCase', {
    useFactory: (c) => c.resolve(GetWorkItemUseCase),
  });
  container.register('UpdateWorkItemUseCase', {
    useFactory: (c) => c.resolve(UpdateWorkItemUseCase),
  });
  container.register('DeleteWorkItemUseCase', {
    useFactory: (c) => c.resolve(DeleteWorkItemUseCase),
  });
  container.register('ManageWorkItemStatesUseCase', {
    useFactory: (c) => c.resolve(ManageWorkItemStatesUseCase),
  });
  container.register('ManageLabelsUseCase', {
    useFactory: (c) => c.resolve(ManageLabelsUseCase),
  });
  container.register('ManageCommentsUseCase', {
    useFactory: (c) => c.resolve(ManageCommentsUseCase),
  });
  container.register('ManageSavedViewsUseCase', {
    useFactory: (c) => c.resolve(ManageSavedViewsUseCase),
  });
  container.register('ManageCustomPropertiesUseCase', {
    useFactory: (c) => c.resolve(ManageCustomPropertiesUseCase),
  });
  container.register('ListActivityLogUseCase', {
    useFactory: (c) => c.resolve(ListActivityLogUseCase),
  });
  container.register('GlobalSearchUseCase', {
    useFactory: (c) => c.resolve(GlobalSearchUseCase),
  });
  container.register('CreateWorkItemRelationUseCase', {
    useFactory: (c) => c.resolve(CreateWorkItemRelationUseCase),
  });
  container.register('DeleteWorkItemRelationUseCase', {
    useFactory: (c) => c.resolve(DeleteWorkItemRelationUseCase),
  });
  container.register('ListWorkItemRelationsUseCase', {
    useFactory: (c) => c.resolve(ListWorkItemRelationsUseCase),
  });
  container.register('BulkUpdateWorkItemsUseCase', {
    useFactory: (c) => c.resolve(BulkUpdateWorkItemsUseCase),
  });

  // Cycle use case string-token aliases
  container.register('CreateCycleUseCase', {
    useFactory: (c) => c.resolve(CreateCycleUseCase),
  });
  container.register('ListCyclesUseCase', {
    useFactory: (c) => c.resolve(ListCyclesUseCase),
  });
  container.register('GetCycleUseCase', {
    useFactory: (c) => c.resolve(GetCycleUseCase),
  });
  container.register('UpdateCycleUseCase', {
    useFactory: (c) => c.resolve(UpdateCycleUseCase),
  });
  container.register('DeleteCycleUseCase', {
    useFactory: (c) => c.resolve(DeleteCycleUseCase),
  });
  container.register('AddItemsToCycleUseCase', {
    useFactory: (c) => c.resolve(AddItemsToCycleUseCase),
  });
  container.register('RemoveItemsFromCycleUseCase', {
    useFactory: (c) => c.resolve(RemoveItemsFromCycleUseCase),
  });
  container.register('TransferCycleItemsUseCase', {
    useFactory: (c) => c.resolve(TransferCycleItemsUseCase),
  });

  // Module use case string-token aliases
  container.register('CreateModuleUseCase', {
    useFactory: (c) => c.resolve(CreateModuleUseCase),
  });
  container.register('ListModulesUseCase', {
    useFactory: (c) => c.resolve(ListModulesUseCase),
  });
  container.register('GetModuleUseCase', {
    useFactory: (c) => c.resolve(GetModuleUseCase),
  });
  container.register('UpdateModuleUseCase', {
    useFactory: (c) => c.resolve(UpdateModuleUseCase),
  });
  container.register('DeleteModuleUseCase', {
    useFactory: (c) => c.resolve(DeleteModuleUseCase),
  });
  container.register('AddItemsToModuleUseCase', {
    useFactory: (c) => c.resolve(AddItemsToModuleUseCase),
  });
  container.register('RemoveItemsFromModuleUseCase', {
    useFactory: (c) => c.resolve(RemoveItemsFromModuleUseCase),
  });

  // Page use case string-token aliases
  container.register('CreatePageUseCase', {
    useFactory: (c) => c.resolve(CreatePageUseCase),
  });
  container.register('ListPagesUseCase', {
    useFactory: (c) => c.resolve(ListPagesUseCase),
  });
  container.register('GetPageUseCase', {
    useFactory: (c) => c.resolve(GetPageUseCase),
  });
  container.register('UpdatePageUseCase', {
    useFactory: (c) => c.resolve(UpdatePageUseCase),
  });
  container.register('DeletePageUseCase', {
    useFactory: (c) => c.resolve(DeletePageUseCase),
  });

  // Analytics use case string-token aliases
  container.register('GetCycleBurndownUseCase', {
    useFactory: (c) => c.resolve(GetCycleBurndownUseCase),
  });
  container.register('GetProjectBreakdownUseCase', {
    useFactory: (c) => c.resolve(GetProjectBreakdownUseCase),
  });
  container.register('GetModuleProgressUseCase', {
    useFactory: (c) => c.resolve(GetModuleProgressUseCase),
  });

  // Register interactive session infrastructure
  container.register<IInteractiveSessionRepository>('IInteractiveSessionRepository', {
    useFactory: (c) => {
      const database = c.resolve<Database.Database>('Database');
      return new SQLiteInteractiveSessionRepository(database);
    },
  });

  container.register<IInteractiveMessageRepository>('IInteractiveMessageRepository', {
    useFactory: (c) => {
      const database = c.resolve<Database.Database>('Database');
      return new SQLiteInteractiveMessageRepository(database);
    },
  });

  container.register<IWorkflowStepRepository>('IWorkflowStepRepository', {
    useFactory: (c) => {
      const database = c.resolve<Database.Database>('Database');
      return new SQLiteWorkflowStepRepository(database);
    },
  });

  // Boot-time recovery: any step left in `running` by a previous
  // daemon is orphaned. Flip it to `interrupted` BEFORE any session
  // can resolve so the UI never shows phantom "in-progress" state
  // from a dead process.
  const workflowStepRepoBoot =
    container.resolve<IWorkflowStepRepository>('IWorkflowStepRepository');
  const interruptedCount = await workflowStepRepoBoot.markAllRunningAsInterrupted();
  if (interruptedCount > 0) {
    // eslint-disable-next-line no-console
    console.log(
      `[workflow-step-recovery] marked ${interruptedCount} orphaned running step(s) as interrupted`
    );
  }

  const interactiveSessionRepo = container.resolve<IInteractiveSessionRepository>(
    'IInteractiveSessionRepository'
  );
  const interactiveMessageRepo = container.resolve<IInteractiveMessageRepository>(
    'IInteractiveMessageRepository'
  );
  const interactiveSessionService = new InteractiveSessionService(
    interactiveSessionRepo,
    interactiveMessageRepo,
    container.resolve<IAgentExecutorFactory>('IAgentExecutorFactory'),
    container.resolve<IFeatureRepository>('IFeatureRepository'),
    new FeatureContextBuilder(),
    workflowStepRepoBoot
  );
  container.registerInstance<IInteractiveSessionService>(
    'IInteractiveSessionService',
    interactiveSessionService
  );

  // Register interactive session use cases
  container.registerSingleton(StartInteractiveSessionUseCase);
  container.registerSingleton(SendInteractiveMessageUseCase);
  container.registerSingleton(StopInteractiveSessionUseCase);
  container.registerSingleton(GetInteractiveChatStateUseCase);
  container.registerSingleton(RespondToInteractionUseCase);

  // String-token aliases for web routes (Turbopack can't resolve .js→.ts
  // imports inside @shepai/core, so routes use string tokens instead of class refs)
  container.register('StartInteractiveSessionUseCase', {
    useFactory: (c) => c.resolve(StartInteractiveSessionUseCase),
  });
  container.register('SendInteractiveMessageUseCase', {
    useFactory: (c) => c.resolve(SendInteractiveMessageUseCase),
  });
  container.register('StopInteractiveSessionUseCase', {
    useFactory: (c) => c.resolve(StopInteractiveSessionUseCase),
  });
  container.register('GetInteractiveChatStateUseCase', {
    useFactory: (c) => c.resolve(GetInteractiveChatStateUseCase),
  });
  container.register('RespondToInteractionUseCase', {
    useFactory: (c) => c.resolve(RespondToInteractionUseCase),
  });

  container.registerSingleton(RunWorkflowUseCase);
  container.register('RunWorkflowUseCase', {
    useFactory: (c) => c.resolve(RunWorkflowUseCase),
  });

  // Startup cleanup: mark any zombie sessions (booting/ready from a prior server run) as stopped
  await interactiveSessionRepo.markAllActiveStopped();

  _initialized = true;
  return container;
}

/**
 * Check whether the DI container has been initialized.
 * Useful for diagnostics and conditional initialization in instrumentation.ts.
 */
export function isContainerInitialized(): boolean {
  return _initialized;
}

/**
 * Get the configured container instance.
 * Container must be initialized first via initializeContainer().
 */
export { container };
