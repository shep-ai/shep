/**
 * EscalateToUserUseCase against the real activity_log table (spec 134).
 *
 * activity_log.work_item_id references work_items(id). An agent question's id
 * is not a work item, so the audit insert fails the foreign key — and it used
 * to throw out of AskAgentQuestionUseCase, after the question was stored and
 * the notification sent. In-memory repositories have no foreign keys, so only
 * the real table shows it.
 */

import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type Database from 'better-sqlite3';
import { createInMemoryDatabase } from '../../../../helpers/database.helper.js';
import { runSQLiteMigrations } from '@/infrastructure/persistence/sqlite/migrations.js';
import { SQLiteActivityLogRepository } from '@/infrastructure/repositories/sqlite-activity-log.repository.js';
import { EscalateToUserUseCase } from '@/application/use-cases/agents/escalate-to-user.use-case.js';
import type { ISettingsRepository } from '@/application/ports/output/repositories/settings.repository.interface.js';
import type { INotificationService } from '@/application/ports/output/services/notification-service.interface.js';
import {
  NotificationEventType,
  NotificationSeverity,
  type Settings,
} from '@/domain/generated/output.js';

describe('EscalateToUserUseCase with SQLite', () => {
  let db: Database.Database;

  beforeEach(async () => {
    db = createInMemoryDatabase();
    db.pragma('foreign_keys = ON');
    await runSQLiteMigrations(db);
  });
  afterEach(() => db.close());

  it('notifies and resolves even though a question id is not a work item', async () => {
    const notify = vi.fn();
    const useCase = new EscalateToUserUseCase(
      { notify } as unknown as INotificationService,
      new SQLiteActivityLogRepository(db),
      {
        load: vi.fn().mockResolvedValue({ featureFlags: { collaboration: true } } as Settings),
      } as unknown as ISettingsRepository
    );

    await expect(
      useCase.execute({
        eventType: NotificationEventType.AgentQuestionBlocking,
        severity: NotificationSeverity.Warning,
        message: 'Which store?',
        agentRunId: 'run-1',
        featureId: 'feat-1',
        featureName: 'feat-1',
        sourceEventId: 'question-not-a-work-item',
        actorId: 'agent',
        auditField: 'agent.question.blocking',
      })
    ).resolves.toEqual({ escalated: true });
    expect(notify).toHaveBeenCalledOnce();
  });
});
