import type { DependencyContainer } from 'tsyringe';

import { ListActivityLogUseCase } from '../../../application/use-cases/activity-log/list-activity-log.use-case.js';
import { GetAiCycleSummaryUseCase } from '../../../application/use-cases/analytics/get-ai-cycle-summary.use-case.js';
import { GetAiProjectHealthUseCase } from '../../../application/use-cases/analytics/get-ai-project-health.use-case.js';
import { GetCycleBurndownUseCase } from '../../../application/use-cases/analytics/get-cycle-burndown.use-case.js';
import { GetModuleProgressUseCase } from '../../../application/use-cases/analytics/get-module-progress.use-case.js';
import { GetProjectBreakdownUseCase } from '../../../application/use-cases/analytics/get-project-breakdown.use-case.js';
import { RunBedrockLifecycleUseCase } from '../../../application/use-cases/applications/run-bedrock-lifecycle.use-case.js';
import { LoginUserUseCase } from '../../../application/use-cases/auth/login-user.use-case.js';
import { LogoutUserUseCase } from '../../../application/use-cases/auth/logout-user.use-case.js';
import { RegisterUserUseCase } from '../../../application/use-cases/auth/register-user.use-case.js';
import { ValidateSessionUseCase } from '../../../application/use-cases/auth/validate-session.use-case.js';
import { EnableBedrockForTargetUseCase } from '../../../application/use-cases/bedrock/enable-bedrock-for-target.use-case.js';
import { GetBedrockMemorySnapshotUseCase } from '../../../application/use-cases/bedrock/get-bedrock-memory-snapshot.use-case.js';
import { ManageCommentsUseCase } from '../../../application/use-cases/comments/manage-comments.use-case.js';
import { ManageCustomPropertiesUseCase } from '../../../application/use-cases/custom-properties/manage-custom-properties.use-case.js';
import { AddItemsToCycleUseCase } from '../../../application/use-cases/cycles/add-items-to-cycle.use-case.js';
import { CreateCycleUseCase } from '../../../application/use-cases/cycles/create-cycle.use-case.js';
import { DeleteCycleUseCase } from '../../../application/use-cases/cycles/delete-cycle.use-case.js';
import { ListCyclesUseCase } from '../../../application/use-cases/cycles/list-cycles.use-case.js';
import { RemoveItemsFromCycleUseCase } from '../../../application/use-cases/cycles/remove-items-from-cycle.use-case.js';
import { TransferCycleItemsUseCase } from '../../../application/use-cases/cycles/transfer-cycle-items.use-case.js';
import { UpdateCycleUseCase } from '../../../application/use-cases/cycles/update-cycle.use-case.js';
import { CreateEpicUseCase } from '../../../application/use-cases/epics/create-epic.use-case.js';
import { DeleteEpicUseCase } from '../../../application/use-cases/epics/delete-epic.use-case.js';
import { ListEpicsUseCase } from '../../../application/use-cases/epics/list-epics.use-case.js';
import { UpdateEpicUseCase } from '../../../application/use-cases/epics/update-epic.use-case.js';
import { ExportWorkItemsCsvUseCase } from '../../../application/use-cases/import-export/export-work-items-csv.use-case.js';
import { AcceptIntakeItemUseCase } from '../../../application/use-cases/intake/accept-intake-item.use-case.js';
import { AutoTriageIntakeItemUseCase } from '../../../application/use-cases/intake/auto-triage-intake-item.use-case.js';
import { CreateIntakeItemUseCase } from '../../../application/use-cases/intake/create-intake-item.use-case.js';
import { DeclineIntakeItemUseCase } from '../../../application/use-cases/intake/decline-intake-item.use-case.js';
import { DetectDuplicatesUseCase } from '../../../application/use-cases/intake/detect-duplicates.use-case.js';
import { ListIntakeItemsUseCase } from '../../../application/use-cases/intake/list-intake-items.use-case.js';
import { ManageLabelsUseCase } from '../../../application/use-cases/labels/manage-labels.use-case.js';
import { AddItemsToModuleUseCase } from '../../../application/use-cases/modules/add-items-to-module.use-case.js';
import { CreateModuleUseCase } from '../../../application/use-cases/modules/create-module.use-case.js';
import { DeleteModuleUseCase } from '../../../application/use-cases/modules/delete-module.use-case.js';
import { ListModulesUseCase } from '../../../application/use-cases/modules/list-modules.use-case.js';
import { RemoveItemsFromModuleUseCase } from '../../../application/use-cases/modules/remove-items-from-module.use-case.js';
import { UpdateModuleUseCase } from '../../../application/use-cases/modules/update-module.use-case.js';
import { ListNotificationsUseCase } from '../../../application/use-cases/notifications/list-notifications.use-case.js';
import { MarkNotificationReadUseCase } from '../../../application/use-cases/notifications/mark-notification-read.use-case.js';
import { CreatePageUseCase } from '../../../application/use-cases/pages/create-page.use-case.js';
import { DeletePageUseCase } from '../../../application/use-cases/pages/delete-page.use-case.js';
import { GetPageUseCase } from '../../../application/use-cases/pages/get-page.use-case.js';
import { ListPagesUseCase } from '../../../application/use-cases/pages/list-pages.use-case.js';
import { UpdatePageUseCase } from '../../../application/use-cases/pages/update-page.use-case.js';
import { DeleteAttachmentUseCase } from '../../../application/use-cases/pm-attachments/delete-attachment.use-case.js';
import { ListAttachmentsUseCase } from '../../../application/use-cases/pm-attachments/list-attachments.use-case.js';
import { UploadAttachmentUseCase } from '../../../application/use-cases/pm-attachments/upload-attachment.use-case.js';
import { CreatePmProjectUseCase } from '../../../application/use-cases/pm-projects/create-pm-project.use-case.js';
import { DeletePmProjectUseCase } from '../../../application/use-cases/pm-projects/delete-pm-project.use-case.js';
import { GetPmProjectUseCase } from '../../../application/use-cases/pm-projects/get-pm-project.use-case.js';
import { ListPmProjectsUseCase } from '../../../application/use-cases/pm-projects/list-pm-projects.use-case.js';
import { UpdatePmProjectUseCase } from '../../../application/use-cases/pm-projects/update-pm-project.use-case.js';
import { AddProjectMemberUseCase } from '../../../application/use-cases/project-members/add-project-member.use-case.js';
import { ListProjectMembersUseCase } from '../../../application/use-cases/project-members/list-project-members.use-case.js';
import { RemoveProjectMemberUseCase } from '../../../application/use-cases/project-members/remove-project-member.use-case.js';
import { UpdateProjectMemberRoleUseCase } from '../../../application/use-cases/project-members/update-project-member-role.use-case.js';
import { ManageSavedViewsUseCase } from '../../../application/use-cases/saved-views/manage-saved-views.use-case.js';
import { GlobalSearchUseCase } from '../../../application/use-cases/search/global-search.use-case.js';
import { DeleteTimeEntryUseCase } from '../../../application/use-cases/time-entries/delete-time-entry.use-case.js';
import { ListTimeEntriesUseCase } from '../../../application/use-cases/time-entries/list-time-entries.use-case.js';
import { LogTimeEntryUseCase } from '../../../application/use-cases/time-entries/log-time-entry.use-case.js';
import { CreateWorkItemRelationUseCase } from '../../../application/use-cases/work-item-relations/create-work-item-relation.use-case.js';
import { DeleteWorkItemRelationUseCase } from '../../../application/use-cases/work-item-relations/delete-work-item-relation.use-case.js';
import { ListWorkItemRelationsUseCase } from '../../../application/use-cases/work-item-relations/list-work-item-relations.use-case.js';
import { ManageWorkItemStatesUseCase } from '../../../application/use-cases/work-item-states/manage-work-item-states.use-case.js';
import { BulkUpdateWorkItemsUseCase } from '../../../application/use-cases/work-items/bulk-update-work-items.use-case.js';
import { CreateWorkItemUseCase } from '../../../application/use-cases/work-items/create-work-item.use-case.js';
import { DeleteWorkItemUseCase } from '../../../application/use-cases/work-items/delete-work-item.use-case.js';
import { GetWorkItemUseCase } from '../../../application/use-cases/work-items/get-work-item.use-case.js';
import { ListWorkItemsUseCase } from '../../../application/use-cases/work-items/list-work-items.use-case.js';
import { UpdateWorkItemUseCase } from '../../../application/use-cases/work-items/update-work-item.use-case.js';

/**
 * Registers project-management (plane-like) use cases with the DI container.
 *
 * Each use case is registered both by its class token (for CLI resolution via
 * `container.resolve(Class)`) and by its string token (for web/server-component
 * resolution via `resolve('ClassName')`). Kept in a dedicated module so the
 * core use-case registration file stays focused.
 */
export function registerPmUseCases(container: DependencyContainer): void {
  container.registerSingleton(ListActivityLogUseCase);
  container.registerSingleton(GetAiCycleSummaryUseCase);
  container.registerSingleton(GetAiProjectHealthUseCase);
  container.registerSingleton(GetCycleBurndownUseCase);
  container.registerSingleton(GetModuleProgressUseCase);
  container.registerSingleton(GetProjectBreakdownUseCase);
  container.registerSingleton(RunBedrockLifecycleUseCase);
  container.registerSingleton(LoginUserUseCase);
  container.registerSingleton(LogoutUserUseCase);
  container.registerSingleton(RegisterUserUseCase);
  container.registerSingleton(ValidateSessionUseCase);
  container.registerSingleton(EnableBedrockForTargetUseCase);
  container.registerSingleton(GetBedrockMemorySnapshotUseCase);
  container.registerSingleton(ManageCommentsUseCase);
  container.registerSingleton(ManageCustomPropertiesUseCase);
  container.registerSingleton(AddItemsToCycleUseCase);
  container.registerSingleton(CreateCycleUseCase);
  container.registerSingleton(DeleteCycleUseCase);
  container.registerSingleton(ListCyclesUseCase);
  container.registerSingleton(RemoveItemsFromCycleUseCase);
  container.registerSingleton(TransferCycleItemsUseCase);
  container.registerSingleton(UpdateCycleUseCase);
  container.registerSingleton(CreateEpicUseCase);
  container.registerSingleton(DeleteEpicUseCase);
  container.registerSingleton(ListEpicsUseCase);
  container.registerSingleton(UpdateEpicUseCase);
  container.registerSingleton(ExportWorkItemsCsvUseCase);
  container.registerSingleton(AcceptIntakeItemUseCase);
  container.registerSingleton(AutoTriageIntakeItemUseCase);
  container.registerSingleton(CreateIntakeItemUseCase);
  container.registerSingleton(DeclineIntakeItemUseCase);
  container.registerSingleton(DetectDuplicatesUseCase);
  container.registerSingleton(ListIntakeItemsUseCase);
  container.registerSingleton(ManageLabelsUseCase);
  container.registerSingleton(AddItemsToModuleUseCase);
  container.registerSingleton(CreateModuleUseCase);
  container.registerSingleton(DeleteModuleUseCase);
  container.registerSingleton(ListModulesUseCase);
  container.registerSingleton(RemoveItemsFromModuleUseCase);
  container.registerSingleton(UpdateModuleUseCase);
  container.registerSingleton(ListNotificationsUseCase);
  container.registerSingleton(MarkNotificationReadUseCase);
  container.registerSingleton(CreatePageUseCase);
  container.registerSingleton(DeletePageUseCase);
  container.registerSingleton(GetPageUseCase);
  container.registerSingleton(ListPagesUseCase);
  container.registerSingleton(UpdatePageUseCase);
  container.registerSingleton(DeleteAttachmentUseCase);
  container.registerSingleton(ListAttachmentsUseCase);
  container.registerSingleton(UploadAttachmentUseCase);
  container.registerSingleton(CreatePmProjectUseCase);
  container.registerSingleton(DeletePmProjectUseCase);
  container.registerSingleton(GetPmProjectUseCase);
  container.registerSingleton(ListPmProjectsUseCase);
  container.registerSingleton(UpdatePmProjectUseCase);
  container.registerSingleton(AddProjectMemberUseCase);
  container.registerSingleton(ListProjectMembersUseCase);
  container.registerSingleton(RemoveProjectMemberUseCase);
  container.registerSingleton(UpdateProjectMemberRoleUseCase);
  container.registerSingleton(ManageSavedViewsUseCase);
  container.registerSingleton(GlobalSearchUseCase);
  container.registerSingleton(DeleteTimeEntryUseCase);
  container.registerSingleton(ListTimeEntriesUseCase);
  container.registerSingleton(LogTimeEntryUseCase);
  container.registerSingleton(CreateWorkItemRelationUseCase);
  container.registerSingleton(DeleteWorkItemRelationUseCase);
  container.registerSingleton(ListWorkItemRelationsUseCase);
  container.registerSingleton(ManageWorkItemStatesUseCase);
  container.registerSingleton(BulkUpdateWorkItemsUseCase);
  container.registerSingleton(CreateWorkItemUseCase);
  container.registerSingleton(DeleteWorkItemUseCase);
  container.registerSingleton(GetWorkItemUseCase);
  container.registerSingleton(ListWorkItemsUseCase);
  container.registerSingleton(UpdateWorkItemUseCase);

  container.register('ListActivityLogUseCase', {
    useFactory: (c) => c.resolve(ListActivityLogUseCase),
  });
  container.register('GetAiCycleSummaryUseCase', {
    useFactory: (c) => c.resolve(GetAiCycleSummaryUseCase),
  });
  container.register('GetAiProjectHealthUseCase', {
    useFactory: (c) => c.resolve(GetAiProjectHealthUseCase),
  });
  container.register('GetCycleBurndownUseCase', {
    useFactory: (c) => c.resolve(GetCycleBurndownUseCase),
  });
  container.register('GetModuleProgressUseCase', {
    useFactory: (c) => c.resolve(GetModuleProgressUseCase),
  });
  container.register('GetProjectBreakdownUseCase', {
    useFactory: (c) => c.resolve(GetProjectBreakdownUseCase),
  });
  container.register('RunBedrockLifecycleUseCase', {
    useFactory: (c) => c.resolve(RunBedrockLifecycleUseCase),
  });
  container.register('LoginUserUseCase', { useFactory: (c) => c.resolve(LoginUserUseCase) });
  container.register('LogoutUserUseCase', { useFactory: (c) => c.resolve(LogoutUserUseCase) });
  container.register('RegisterUserUseCase', { useFactory: (c) => c.resolve(RegisterUserUseCase) });
  container.register('ValidateSessionUseCase', {
    useFactory: (c) => c.resolve(ValidateSessionUseCase),
  });
  container.register('EnableBedrockForTargetUseCase', {
    useFactory: (c) => c.resolve(EnableBedrockForTargetUseCase),
  });
  container.register('GetBedrockMemorySnapshotUseCase', {
    useFactory: (c) => c.resolve(GetBedrockMemorySnapshotUseCase),
  });
  container.register('ManageCommentsUseCase', {
    useFactory: (c) => c.resolve(ManageCommentsUseCase),
  });
  container.register('ManageCustomPropertiesUseCase', {
    useFactory: (c) => c.resolve(ManageCustomPropertiesUseCase),
  });
  container.register('AddItemsToCycleUseCase', {
    useFactory: (c) => c.resolve(AddItemsToCycleUseCase),
  });
  container.register('CreateCycleUseCase', { useFactory: (c) => c.resolve(CreateCycleUseCase) });
  container.register('DeleteCycleUseCase', { useFactory: (c) => c.resolve(DeleteCycleUseCase) });
  container.register('ListCyclesUseCase', { useFactory: (c) => c.resolve(ListCyclesUseCase) });
  container.register('RemoveItemsFromCycleUseCase', {
    useFactory: (c) => c.resolve(RemoveItemsFromCycleUseCase),
  });
  container.register('TransferCycleItemsUseCase', {
    useFactory: (c) => c.resolve(TransferCycleItemsUseCase),
  });
  container.register('UpdateCycleUseCase', { useFactory: (c) => c.resolve(UpdateCycleUseCase) });
  container.register('CreateEpicUseCase', { useFactory: (c) => c.resolve(CreateEpicUseCase) });
  container.register('DeleteEpicUseCase', { useFactory: (c) => c.resolve(DeleteEpicUseCase) });
  container.register('ListEpicsUseCase', { useFactory: (c) => c.resolve(ListEpicsUseCase) });
  container.register('UpdateEpicUseCase', { useFactory: (c) => c.resolve(UpdateEpicUseCase) });
  container.register('ExportWorkItemsCsvUseCase', {
    useFactory: (c) => c.resolve(ExportWorkItemsCsvUseCase),
  });
  container.register('AcceptIntakeItemUseCase', {
    useFactory: (c) => c.resolve(AcceptIntakeItemUseCase),
  });
  container.register('AutoTriageIntakeItemUseCase', {
    useFactory: (c) => c.resolve(AutoTriageIntakeItemUseCase),
  });
  container.register('CreateIntakeItemUseCase', {
    useFactory: (c) => c.resolve(CreateIntakeItemUseCase),
  });
  container.register('DeclineIntakeItemUseCase', {
    useFactory: (c) => c.resolve(DeclineIntakeItemUseCase),
  });
  container.register('DetectDuplicatesUseCase', {
    useFactory: (c) => c.resolve(DetectDuplicatesUseCase),
  });
  container.register('ListIntakeItemsUseCase', {
    useFactory: (c) => c.resolve(ListIntakeItemsUseCase),
  });
  container.register('ManageLabelsUseCase', { useFactory: (c) => c.resolve(ManageLabelsUseCase) });
  container.register('AddItemsToModuleUseCase', {
    useFactory: (c) => c.resolve(AddItemsToModuleUseCase),
  });
  container.register('CreateModuleUseCase', { useFactory: (c) => c.resolve(CreateModuleUseCase) });
  container.register('DeleteModuleUseCase', { useFactory: (c) => c.resolve(DeleteModuleUseCase) });
  container.register('ListModulesUseCase', { useFactory: (c) => c.resolve(ListModulesUseCase) });
  container.register('RemoveItemsFromModuleUseCase', {
    useFactory: (c) => c.resolve(RemoveItemsFromModuleUseCase),
  });
  container.register('UpdateModuleUseCase', { useFactory: (c) => c.resolve(UpdateModuleUseCase) });
  container.register('ListNotificationsUseCase', {
    useFactory: (c) => c.resolve(ListNotificationsUseCase),
  });
  container.register('MarkNotificationReadUseCase', {
    useFactory: (c) => c.resolve(MarkNotificationReadUseCase),
  });
  container.register('CreatePageUseCase', { useFactory: (c) => c.resolve(CreatePageUseCase) });
  container.register('DeletePageUseCase', { useFactory: (c) => c.resolve(DeletePageUseCase) });
  container.register('GetPageUseCase', { useFactory: (c) => c.resolve(GetPageUseCase) });
  container.register('ListPagesUseCase', { useFactory: (c) => c.resolve(ListPagesUseCase) });
  container.register('UpdatePageUseCase', { useFactory: (c) => c.resolve(UpdatePageUseCase) });
  container.register('DeleteAttachmentUseCase', {
    useFactory: (c) => c.resolve(DeleteAttachmentUseCase),
  });
  container.register('ListAttachmentsUseCase', {
    useFactory: (c) => c.resolve(ListAttachmentsUseCase),
  });
  container.register('UploadAttachmentUseCase', {
    useFactory: (c) => c.resolve(UploadAttachmentUseCase),
  });
  container.register('CreatePmProjectUseCase', {
    useFactory: (c) => c.resolve(CreatePmProjectUseCase),
  });
  container.register('DeletePmProjectUseCase', {
    useFactory: (c) => c.resolve(DeletePmProjectUseCase),
  });
  container.register('GetPmProjectUseCase', { useFactory: (c) => c.resolve(GetPmProjectUseCase) });
  container.register('ListPmProjectsUseCase', {
    useFactory: (c) => c.resolve(ListPmProjectsUseCase),
  });
  container.register('UpdatePmProjectUseCase', {
    useFactory: (c) => c.resolve(UpdatePmProjectUseCase),
  });
  container.register('AddProjectMemberUseCase', {
    useFactory: (c) => c.resolve(AddProjectMemberUseCase),
  });
  container.register('ListProjectMembersUseCase', {
    useFactory: (c) => c.resolve(ListProjectMembersUseCase),
  });
  container.register('RemoveProjectMemberUseCase', {
    useFactory: (c) => c.resolve(RemoveProjectMemberUseCase),
  });
  container.register('UpdateProjectMemberRoleUseCase', {
    useFactory: (c) => c.resolve(UpdateProjectMemberRoleUseCase),
  });
  container.register('ManageSavedViewsUseCase', {
    useFactory: (c) => c.resolve(ManageSavedViewsUseCase),
  });
  container.register('GlobalSearchUseCase', { useFactory: (c) => c.resolve(GlobalSearchUseCase) });
  container.register('DeleteTimeEntryUseCase', {
    useFactory: (c) => c.resolve(DeleteTimeEntryUseCase),
  });
  container.register('ListTimeEntriesUseCase', {
    useFactory: (c) => c.resolve(ListTimeEntriesUseCase),
  });
  container.register('LogTimeEntryUseCase', { useFactory: (c) => c.resolve(LogTimeEntryUseCase) });
  container.register('CreateWorkItemRelationUseCase', {
    useFactory: (c) => c.resolve(CreateWorkItemRelationUseCase),
  });
  container.register('DeleteWorkItemRelationUseCase', {
    useFactory: (c) => c.resolve(DeleteWorkItemRelationUseCase),
  });
  container.register('ListWorkItemRelationsUseCase', {
    useFactory: (c) => c.resolve(ListWorkItemRelationsUseCase),
  });
  container.register('ManageWorkItemStatesUseCase', {
    useFactory: (c) => c.resolve(ManageWorkItemStatesUseCase),
  });
  container.register('BulkUpdateWorkItemsUseCase', {
    useFactory: (c) => c.resolve(BulkUpdateWorkItemsUseCase),
  });
  container.register('CreateWorkItemUseCase', {
    useFactory: (c) => c.resolve(CreateWorkItemUseCase),
  });
  container.register('DeleteWorkItemUseCase', {
    useFactory: (c) => c.resolve(DeleteWorkItemUseCase),
  });
  container.register('GetWorkItemUseCase', { useFactory: (c) => c.resolve(GetWorkItemUseCase) });
  container.register('ListWorkItemsUseCase', {
    useFactory: (c) => c.resolve(ListWorkItemsUseCase),
  });
  container.register('UpdateWorkItemUseCase', {
    useFactory: (c) => c.resolve(UpdateWorkItemUseCase),
  });
}
