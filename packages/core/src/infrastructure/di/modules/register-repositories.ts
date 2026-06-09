import type { DependencyContainer } from 'tsyringe';
import type Database from 'better-sqlite3';

import type { ISettingsRepository } from '../../../application/ports/output/repositories/settings.repository.interface.js';
import { SQLiteSettingsRepository } from '../../repositories/sqlite-settings.repository.js';
import type { IFeatureRepository } from '../../../application/ports/output/repositories/feature-repository.interface.js';
import { SQLiteFeatureRepository } from '../../repositories/sqlite-feature.repository.js';
import type { IRepositoryRepository } from '../../../application/ports/output/repositories/repository-repository.interface.js';
import { SQLiteRepositoryRepository } from '../../repositories/sqlite-repository.repository.js';
import type { IApplicationRepository } from '../../../application/ports/output/repositories/application-repository.interface.js';
import { SQLiteApplicationRepository } from '../../repositories/sqlite-application.repository.js';
import type { IAgentRunRepository } from '../../../application/ports/output/agents/agent-run-repository.interface.js';
import { SQLiteAgentRunRepository } from '../../repositories/agent-run.repository.js';
import type { IPhaseTimingRepository } from '../../../application/ports/output/agents/phase-timing-repository.interface.js';
import { SQLitePhaseTimingRepository } from '../../repositories/sqlite-phase-timing.repository.js';
import type { IInteractiveSessionRepository } from '../../../application/ports/output/repositories/interactive-session-repository.interface.js';
import type { IInteractiveMessageRepository } from '../../../application/ports/output/repositories/interactive-message-repository.interface.js';
import type { IWorkflowStepRepository } from '../../../application/ports/output/repositories/workflow-step-repository.interface.js';
import { SQLiteInteractiveSessionRepository } from '../../repositories/sqlite-interactive-session.repository.js';
import { SQLiteInteractiveMessageRepository } from '../../repositories/sqlite-interactive-message.repository.js';
import { SQLiteWorkflowStepRepository } from '../../repositories/sqlite-workflow-step.repository.js';
import type { IOperationLogRepository } from '../../../application/ports/output/repositories/operation-log.repository.interface.js';
import { SQLiteOperationLogRepository } from '../../repositories/sqlite-operation-log.repository.js';
import type { IOperationLogEventBus } from '../../../application/ports/output/services/operation-log-event-bus.interface.js';

// Project management (feature 087) repositories
import type { IPmProjectRepository } from '../../../application/ports/output/repositories/pm-project-repository.interface.js';
import { SQLitePmProjectRepository } from '../../repositories/sqlite-pm-project.repository.js';
import type { IWorkItemRepository } from '../../../application/ports/output/repositories/work-item-repository.interface.js';
import { SQLiteWorkItemRepository } from '../../repositories/sqlite-work-item.repository.js';
import type { IWorkItemStateRepository } from '../../../application/ports/output/repositories/work-item-state-repository.interface.js';
import { SQLiteWorkItemStateRepository } from '../../repositories/sqlite-work-item-state.repository.js';
import type { ILabelRepository } from '../../../application/ports/output/repositories/label-repository.interface.js';
import { SQLiteLabelRepository } from '../../repositories/sqlite-label.repository.js';
import type { ICommentRepository } from '../../../application/ports/output/repositories/comment-repository.interface.js';
import { SQLiteCommentRepository } from '../../repositories/sqlite-comment.repository.js';
import type { ISavedViewRepository } from '../../../application/ports/output/repositories/saved-view-repository.interface.js';
import { SQLiteSavedViewRepository } from '../../repositories/sqlite-saved-view.repository.js';
import type { ICustomPropertyRepository } from '../../../application/ports/output/repositories/custom-property-repository.interface.js';
import { SQLiteCustomPropertyRepository } from '../../repositories/sqlite-custom-property.repository.js';
import type { IActivityLogRepository } from '../../../application/ports/output/repositories/activity-log-repository.interface.js';
import { SQLiteActivityLogRepository } from '../../repositories/sqlite-activity-log.repository.js';
import type { IWorkItemRelationRepository } from '../../../application/ports/output/repositories/work-item-relation-repository.interface.js';
import { SQLiteWorkItemRelationRepository } from '../../repositories/sqlite-work-item-relation.repository.js';
import type { ICycleRepository } from '../../../application/ports/output/repositories/cycle-repository.interface.js';
import { SQLiteCycleRepository } from '../../repositories/sqlite-cycle.repository.js';
import type { IPmModuleRepository } from '../../../application/ports/output/repositories/pm-module-repository.interface.js';
import { SQLitePmModuleRepository } from '../../repositories/sqlite-pm-module.repository.js';
import type { IPageRepository } from '../../../application/ports/output/repositories/page-repository.interface.js';
import { SQLitePageRepository } from '../../repositories/sqlite-page.repository.js';
import type { IPageVersionRepository } from '../../../application/ports/output/repositories/page-version-repository.interface.js';
import { SQLitePageVersionRepository } from '../../repositories/sqlite-page-version.repository.js';
import type { IEpicRepository } from '../../../application/ports/output/repositories/epic-repository.interface.js';
import { SQLiteEpicRepository } from '../../repositories/sqlite-epic.repository.js';
import type { IPmAttachmentRepository } from '../../../application/ports/output/repositories/pm-attachment-repository.interface.js';
import { SQLitePmAttachmentRepository } from '../../repositories/sqlite-pm-attachment.repository.js';
import type { ITimeEntryRepository } from '../../../application/ports/output/repositories/time-entry-repository.interface.js';
import { SQLiteTimeEntryRepository } from '../../repositories/sqlite-time-entry.repository.js';
import type { IIntakeItemRepository } from '../../../application/ports/output/repositories/intake-item-repository.interface.js';
import { SQLiteIntakeItemRepository } from '../../repositories/sqlite-intake-item.repository.js';
import type { INotificationRepository } from '../../../application/ports/output/repositories/notification-repository.interface.js';
import { SQLiteNotificationRepository } from '../../repositories/sqlite-notification.repository.js';
import type { IPmUserRepository } from '../../../application/ports/output/repositories/pm-user-repository.interface.js';
import { SQLitePmUserRepository } from '../../repositories/sqlite-pm-user.repository.js';
import type { IPmSessionRepository } from '../../../application/ports/output/repositories/pm-session-repository.interface.js';
import { SQLitePmSessionRepository } from '../../repositories/sqlite-pm-session.repository.js';
import type { IPmProjectMemberRepository } from '../../../application/ports/output/repositories/pm-project-member-repository.interface.js';
import { SQLitePmProjectMemberRepository } from '../../repositories/sqlite-pm-project-member.repository.js';
import type { IPmAuditLogRepository } from '../../../application/ports/output/repositories/pm-audit-log-repository.interface.js';
import { SQLitePmAuditLogRepository } from '../../repositories/sqlite-pm-audit-log.repository.js';

// Code review (feature 090) repository
import type { ICodeReviewRepository } from '../../../application/ports/output/repositories/code-review-repository.interface.js';
import { SQLiteCodeReviewRepository } from '../../repositories/sqlite-code-review.repository.js';

// Collaboration & supervision (feature 093) repositories
import type { IAgentMessageRepository } from '../../../application/ports/output/repositories/agent-message-repository.interface.js';
import { SQLiteAgentMessageRepository } from '../../repositories/sqlite-agent-message.repository.js';
import type { IAgentQuestionRepository } from '../../../application/ports/output/repositories/agent-question-repository.interface.js';
import { SQLiteAgentQuestionRepository } from '../../repositories/sqlite-agent-question.repository.js';
import type { ISupervisorPolicyRepository } from '../../../application/ports/output/repositories/supervisor-policy-repository.interface.js';
import { SQLiteSupervisorPolicyRepository } from '../../repositories/sqlite-supervisor-policy.repository.js';
import type { ISupervisorDecisionRepository } from '../../../application/ports/output/repositories/supervisor-decision-repository.interface.js';
import { SQLiteSupervisorDecisionRepository } from '../../repositories/sqlite-supervisor-decision.repository.js';
import type { IAgentPromptOverrideRepository } from '../../../application/ports/output/repositories/agent-prompt-override-repository.interface.js';
import { SQLiteAgentPromptOverrideRepository } from '../../repositories/sqlite-agent-prompt-override.repository.js';
import type { IAgentPromptResolver } from '../../../application/ports/output/agents/agent-prompt-resolver.interface.js';
import { SQLiteAgentPromptResolver } from '../../services/agents/prompt-resolver/sqlite-agent-prompt-resolver.service.js';
import type { IAgentGraphOverrideRepository } from '../../../application/ports/output/repositories/agent-graph-override-repository.interface.js';
import { SQLiteAgentGraphOverrideRepository } from '../../repositories/sqlite-agent-graph-override.repository.js';
import type { ICustomAgentRepository } from '../../../application/ports/output/repositories/custom-agent-repository.interface.js';
import { SQLiteCustomAgentRepository } from '../../repositories/sqlite-custom-agent.repository.js';

// Contributor onboarding (feature 097) repositories
import type { IContributorRepository } from '../../../application/ports/output/repositories/contributor-repository.interface.js';
import { SQLiteContributorRepository } from '../../repositories/sqlite-contributor.repository.js';
import type { IRecognitionEventRepository } from '../../../application/ports/output/repositories/recognition-event-repository.interface.js';
import { SQLiteRecognitionEventRepository } from '../../repositories/sqlite-recognition-event.repository.js';

// SDLC Kanban Board (feature sdlc-board) repositories
import type { ISdlcTaskRepository } from '../../../application/ports/output/repositories/sdlc-task-repository.interface.js';
import { SQLiteSdlcTaskRepository } from '../../repositories/sqlite-sdlc-task.repository.js';
import type { ISdlcSubTaskRepository } from '../../../application/ports/output/repositories/sdlc-subtask-repository.interface.js';
import { SQLiteSdlcSubTaskRepository } from '../../repositories/sqlite-sdlc-subtask.repository.js';
// Project memory ("Shep Brain", feature 102) repository
import type { IProjectMemoryRepository } from '../../../application/ports/output/repositories/project-memory-repository.interface.js';
import { SQLiteProjectMemoryRepository } from '../../repositories/sqlite-project-memory.repository.js';

/**
 * Register all SQLite-backed repositories.
 *
 * Depends on the `'Database'` token being registered first.
 */
export function registerRepositories(container: DependencyContainer): void {
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

  container.register<IOperationLogRepository>('IOperationLogRepository', {
    useFactory: (c) => {
      const database = c.resolve<Database.Database>('Database');
      const bus = c.resolve<IOperationLogEventBus>('IOperationLogEventBus');
      return new SQLiteOperationLogRepository(database, bus);
    },
  });

  // ─── Project management (feature 087) repositories ──────────────────────
  container.register<IPmProjectRepository>('IPmProjectRepository', {
    useFactory: (c) => new SQLitePmProjectRepository(c.resolve<Database.Database>('Database')),
  });
  container.register<IWorkItemRepository>('IWorkItemRepository', {
    useFactory: (c) => new SQLiteWorkItemRepository(c.resolve<Database.Database>('Database')),
  });
  container.register<IWorkItemStateRepository>('IWorkItemStateRepository', {
    useFactory: (c) => new SQLiteWorkItemStateRepository(c.resolve<Database.Database>('Database')),
  });
  container.register<ILabelRepository>('ILabelRepository', {
    useFactory: (c) => new SQLiteLabelRepository(c.resolve<Database.Database>('Database')),
  });
  container.register<ICommentRepository>('ICommentRepository', {
    useFactory: (c) => new SQLiteCommentRepository(c.resolve<Database.Database>('Database')),
  });
  container.register<ISavedViewRepository>('ISavedViewRepository', {
    useFactory: (c) => new SQLiteSavedViewRepository(c.resolve<Database.Database>('Database')),
  });
  container.register<ICustomPropertyRepository>('ICustomPropertyRepository', {
    useFactory: (c) => new SQLiteCustomPropertyRepository(c.resolve<Database.Database>('Database')),
  });
  container.register<IActivityLogRepository>('IActivityLogRepository', {
    useFactory: (c) => new SQLiteActivityLogRepository(c.resolve<Database.Database>('Database')),
  });
  container.register<IWorkItemRelationRepository>('IWorkItemRelationRepository', {
    useFactory: (c) =>
      new SQLiteWorkItemRelationRepository(c.resolve<Database.Database>('Database')),
  });
  container.register<ICycleRepository>('ICycleRepository', {
    useFactory: (c) => new SQLiteCycleRepository(c.resolve<Database.Database>('Database')),
  });
  container.register<IPmModuleRepository>('IPmModuleRepository', {
    useFactory: (c) => new SQLitePmModuleRepository(c.resolve<Database.Database>('Database')),
  });
  container.register<IPageRepository>('IPageRepository', {
    useFactory: (c) => new SQLitePageRepository(c.resolve<Database.Database>('Database')),
  });
  container.register<IPageVersionRepository>('IPageVersionRepository', {
    useFactory: (c) => new SQLitePageVersionRepository(c.resolve<Database.Database>('Database')),
  });
  container.register<IEpicRepository>('IEpicRepository', {
    useFactory: (c) => new SQLiteEpicRepository(c.resolve<Database.Database>('Database')),
  });
  container.register<IPmAttachmentRepository>('IPmAttachmentRepository', {
    useFactory: (c) => new SQLitePmAttachmentRepository(c.resolve<Database.Database>('Database')),
  });
  container.register<ITimeEntryRepository>('ITimeEntryRepository', {
    useFactory: (c) => new SQLiteTimeEntryRepository(c.resolve<Database.Database>('Database')),
  });
  container.register<IIntakeItemRepository>('IIntakeItemRepository', {
    useFactory: (c) => new SQLiteIntakeItemRepository(c.resolve<Database.Database>('Database')),
  });
  container.register<INotificationRepository>('INotificationRepository', {
    useFactory: (c) => new SQLiteNotificationRepository(c.resolve<Database.Database>('Database')),
  });
  container.register<IPmUserRepository>('IPmUserRepository', {
    useFactory: (c) => new SQLitePmUserRepository(c.resolve<Database.Database>('Database')),
  });
  container.register<IPmSessionRepository>('IPmSessionRepository', {
    useFactory: (c) => new SQLitePmSessionRepository(c.resolve<Database.Database>('Database')),
  });
  container.register<IPmProjectMemberRepository>('IPmProjectMemberRepository', {
    useFactory: (c) =>
      new SQLitePmProjectMemberRepository(c.resolve<Database.Database>('Database')),
  });
  container.register<IPmAuditLogRepository>('IPmAuditLogRepository', {
    useFactory: (c) => new SQLitePmAuditLogRepository(c.resolve<Database.Database>('Database')),
  });

  // ─── Code review (feature 090) repository ─────────────────────────────
  container.register<ICodeReviewRepository>('ICodeReviewRepository', {
    useFactory: (c) => new SQLiteCodeReviewRepository(c.resolve<Database.Database>('Database')),
  });

  // ─── Collaboration & supervision (feature 093) repositories ──────────
  container.register<IAgentMessageRepository>('IAgentMessageRepository', {
    useFactory: (c) => new SQLiteAgentMessageRepository(c.resolve<Database.Database>('Database')),
  });
  container.register<IAgentQuestionRepository>('IAgentQuestionRepository', {
    useFactory: (c) => new SQLiteAgentQuestionRepository(c.resolve<Database.Database>('Database')),
  });
  container.register<ISupervisorPolicyRepository>('ISupervisorPolicyRepository', {
    useFactory: (c) =>
      new SQLiteSupervisorPolicyRepository(c.resolve<Database.Database>('Database')),
  });
  container.register<ISupervisorDecisionRepository>('ISupervisorDecisionRepository', {
    useFactory: (c) =>
      new SQLiteSupervisorDecisionRepository(c.resolve<Database.Database>('Database')),
  });
  container.register<IAgentPromptOverrideRepository>('IAgentPromptOverrideRepository', {
    useFactory: (c) =>
      new SQLiteAgentPromptOverrideRepository(c.resolve<Database.Database>('Database')),
  });
  container.register<IAgentPromptResolver>('IAgentPromptResolver', {
    useFactory: (c) =>
      new SQLiteAgentPromptResolver(
        c.resolve<IAgentPromptOverrideRepository>('IAgentPromptOverrideRepository')
      ),
  });
  container.register<IAgentGraphOverrideRepository>('IAgentGraphOverrideRepository', {
    useFactory: (c) =>
      new SQLiteAgentGraphOverrideRepository(c.resolve<Database.Database>('Database')),
  });
  container.register<ICustomAgentRepository>('ICustomAgentRepository', {
    useFactory: (c) => new SQLiteCustomAgentRepository(c.resolve<Database.Database>('Database')),
  });

  // ─── Contributor onboarding (feature 097) repositories ────────────────
  container.register<IContributorRepository>('IContributorRepository', {
    useFactory: (c) => new SQLiteContributorRepository(c.resolve<Database.Database>('Database')),
  });
  container.register<IRecognitionEventRepository>('IRecognitionEventRepository', {
    useFactory: (c) =>
      new SQLiteRecognitionEventRepository(c.resolve<Database.Database>('Database')),
  });

  // ─── SDLC Kanban Board (feature sdlc-board) repositories ──────────────
  container.register<ISdlcTaskRepository>('ISdlcTaskRepository', {
    useFactory: (c) => new SQLiteSdlcTaskRepository(c.resolve<Database.Database>('Database')),
  });
  container.register<ISdlcSubTaskRepository>('ISdlcSubTaskRepository', {
    useFactory: (c) => new SQLiteSdlcSubTaskRepository(c.resolve<Database.Database>('Database')),
  });

  // ─── Project memory ("Shep Brain", feature 102) repository ────────────
  container.register<IProjectMemoryRepository>('IProjectMemoryRepository', {
    useFactory: (c) => new SQLiteProjectMemoryRepository(c.resolve<Database.Database>('Database')),
  });
}
