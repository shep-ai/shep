import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock native/heavy dependencies that container.ts transitively imports.
vi.mock('node-notifier', () => ({ default: { notify: vi.fn() } }));
vi.mock('which', () => ({ default: vi.fn().mockResolvedValue(null) }));
vi.mock('better-sqlite3', () => ({
  default: vi.fn().mockReturnValue({
    pragma: vi.fn(),
    exec: vi.fn(),
    prepare: vi.fn().mockReturnValue({
      run: vi.fn().mockReturnValue({ changes: 0, lastInsertRowid: 0 }),
      get: vi.fn(),
      all: vi.fn(),
    }),
  }),
}));

vi.mock('../../../../packages/core/src/infrastructure/persistence/sqlite/connection.js', () => ({
  getSQLiteConnection: vi.fn().mockResolvedValue({
    pragma: vi.fn(),
    exec: vi.fn(),
    prepare: vi.fn().mockReturnValue({
      run: vi.fn().mockReturnValue({ changes: 0, lastInsertRowid: 0 }),
      get: vi.fn(),
      all: vi.fn(),
    }),
  }),
}));

vi.mock('../../../../packages/core/src/infrastructure/persistence/sqlite/migrations.js', () => ({
  runSQLiteMigrations: vi.fn().mockResolvedValue(undefined),
}));

vi.mock(
  '../../../../packages/core/src/infrastructure/services/notifications/notification-bus.js',
  () => ({ getNotificationBus: vi.fn().mockReturnValue({}) })
);

vi.mock(
  '../../../../packages/core/src/infrastructure/services/agents/common/checkpointer.js',
  () => ({ createCheckpointer: vi.fn().mockReturnValue({}) })
);

const CONTAINER = '../../../../packages/core/src/infrastructure/di/container.js';

/**
 * Every project-management use case the web/server layer resolves by string
 * token (`resolve('XxxUseCase')`). The PM feature (PR #552) shipped these use
 * cases without DI registration, so every PM page threw
 * "Attempted to resolve unregistered dependency token" at runtime. This test
 * guards against that whole class of regression by asserting each token
 * resolves from the fully-bootstrapped container.
 */
const PM_USE_CASE_TOKENS = [
  'AcceptIntakeItemUseCase',
  'AddItemsToCycleUseCase',
  'AddItemsToModuleUseCase',
  'AddProjectMemberUseCase',
  'AutoTriageIntakeItemUseCase',
  'BulkUpdateWorkItemsUseCase',
  'CreateCycleUseCase',
  'CreateEpicUseCase',
  'CreateIntakeItemUseCase',
  'CreateModuleUseCase',
  'CreatePageUseCase',
  'CreatePmProjectUseCase',
  'CreateWorkItemRelationUseCase',
  'CreateWorkItemUseCase',
  'DeclineIntakeItemUseCase',
  'DeleteAttachmentUseCase',
  'DeleteCycleUseCase',
  'DeleteEpicUseCase',
  'DeleteModuleUseCase',
  'DeletePageUseCase',
  'DeletePmProjectUseCase',
  'DeleteTimeEntryUseCase',
  'DeleteWorkItemRelationUseCase',
  'DeleteWorkItemUseCase',
  'DetectDuplicatesUseCase',
  'EnableBedrockForTargetUseCase',
  'ExportWorkItemsCsvUseCase',
  'GetAiCycleSummaryUseCase',
  'GetAiProjectHealthUseCase',
  'GetBedrockMemorySnapshotUseCase',
  'GetCycleBurndownUseCase',
  'GetModuleProgressUseCase',
  'GetPageUseCase',
  'GetPmProjectUseCase',
  'GetProjectBreakdownUseCase',
  'GetWorkItemUseCase',
  'GlobalSearchUseCase',
  'ListActivityLogUseCase',
  'ListAttachmentsUseCase',
  'ListCyclesUseCase',
  'ListEpicsUseCase',
  'ListIntakeItemsUseCase',
  'ListModulesUseCase',
  'ListNotificationsUseCase',
  'ListPagesUseCase',
  'ListPmProjectsUseCase',
  'ListProjectMembersUseCase',
  'ListTimeEntriesUseCase',
  'ListWorkItemRelationsUseCase',
  'ListWorkItemsUseCase',
  'LogTimeEntryUseCase',
  'LoginUserUseCase',
  'LogoutUserUseCase',
  'ManageCommentsUseCase',
  'ManageCustomPropertiesUseCase',
  'ManageLabelsUseCase',
  'ManageSavedViewsUseCase',
  'ManageWorkItemStatesUseCase',
  'MarkNotificationReadUseCase',
  'RegisterUserUseCase',
  'RemoveItemsFromCycleUseCase',
  'RemoveItemsFromModuleUseCase',
  'RemoveProjectMemberUseCase',
  'RunBedrockLifecycleUseCase',
  'TransferCycleItemsUseCase',
  'UpdateCycleUseCase',
  'UpdateEpicUseCase',
  'UpdateModuleUseCase',
  'UpdatePageUseCase',
  'UpdatePmProjectUseCase',
  'UpdateProjectMemberRoleUseCase',
  'UpdateWorkItemUseCase',
  'UploadAttachmentUseCase',
  'ValidateSessionUseCase',
] as const;

describe('Project-management DI registrations (PR #552)', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it.each(PM_USE_CASE_TOKENS)('resolves %s by string token', async (token) => {
    const { initializeContainer } = await import(CONTAINER);
    const container = await initializeContainer();
    const instance = container.resolve(token);
    expect(instance).toBeDefined();
    expect(typeof instance).toBe('object');
  });
});
