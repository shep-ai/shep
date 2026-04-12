import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock native/heavy dependencies that container.ts transitively imports
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
  () => ({
    getNotificationBus: vi.fn().mockReturnValue({}),
  })
);

vi.mock(
  '../../../../packages/core/src/infrastructure/services/agents/common/checkpointer.js',
  () => ({
    createCheckpointer: vi.fn().mockReturnValue({}),
  })
);

describe('session DI registrations', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('resolves ListAgentSessionsUseCase after initialization', async () => {
    const { initializeContainer } = await import(
      '../../../../packages/core/src/infrastructure/di/container.js'
    );
    const { ListAgentSessionsUseCase } = await import(
      '../../../../packages/core/src/application/use-cases/agents/list-agent-sessions.use-case.js'
    );

    const container = await initializeContainer();
    expect(() => container.resolve(ListAgentSessionsUseCase)).not.toThrow();
    expect(container.resolve(ListAgentSessionsUseCase)).toBeInstanceOf(ListAgentSessionsUseCase);
  });

  it('resolves GetAgentSessionUseCase after initialization', async () => {
    const { initializeContainer } = await import(
      '../../../../packages/core/src/infrastructure/di/container.js'
    );
    const { GetAgentSessionUseCase } = await import(
      '../../../../packages/core/src/application/use-cases/agents/get-agent-session.use-case.js'
    );

    const container = await initializeContainer();
    expect(() => container.resolve(GetAgentSessionUseCase)).not.toThrow();
    expect(container.resolve(GetAgentSessionUseCase)).toBeInstanceOf(GetAgentSessionUseCase);
  });

  it('resolves IAgentSessionRepository:claude-code as ClaudeCodeSessionRepository', async () => {
    const { initializeContainer } = await import(
      '../../../../packages/core/src/infrastructure/di/container.js'
    );
    const { ClaudeCodeSessionRepository } = await import(
      '../../../../packages/core/src/infrastructure/services/agents/sessions/claude-code-session.repository.js'
    );
    const { AgentType } = await import('../../../../packages/core/src/domain/generated/output.js');

    const container = await initializeContainer();
    const repo = container.resolve(`IAgentSessionRepository:${AgentType.ClaudeCode}`);
    expect(repo).toBeInstanceOf(ClaudeCodeSessionRepository);
  });

  it('resolves IAgentSessionRepository:cursor as StubSessionRepository', async () => {
    const { initializeContainer } = await import(
      '../../../../packages/core/src/infrastructure/di/container.js'
    );
    const { StubSessionRepository } = await import(
      '../../../../packages/core/src/infrastructure/services/agents/sessions/stub-session.repository.js'
    );
    const { AgentType } = await import('../../../../packages/core/src/domain/generated/output.js');

    const container = await initializeContainer();
    const repo = container.resolve(`IAgentSessionRepository:${AgentType.Cursor}`);
    expect(repo).toBeInstanceOf(StubSessionRepository);
  });

  it('resolves IAgentSessionRepository:gemini-cli as StubSessionRepository', async () => {
    const { initializeContainer } = await import(
      '../../../../packages/core/src/infrastructure/di/container.js'
    );
    const { StubSessionRepository } = await import(
      '../../../../packages/core/src/infrastructure/services/agents/sessions/stub-session.repository.js'
    );
    const { AgentType } = await import('../../../../packages/core/src/domain/generated/output.js');

    const container = await initializeContainer();
    const repo = container.resolve(`IAgentSessionRepository:${AgentType.GeminiCli}`);
    expect(repo).toBeInstanceOf(StubSessionRepository);
  });

  it('resolves IAgentSessionRepository:codex-cli as CodexCliSessionRepository', async () => {
    const { initializeContainer } = await import(
      '../../../../packages/core/src/infrastructure/di/container.js'
    );
    const { CodexCliSessionRepository } = await import(
      '../../../../packages/core/src/infrastructure/services/agents/sessions/codex-cli-session.repository.js'
    );
    const { AgentType } = await import('../../../../packages/core/src/domain/generated/output.js');

    const container = await initializeContainer();
    const repo = container.resolve(`IAgentSessionRepository:${AgentType.CodexCli}`);
    expect(repo).toBeInstanceOf(CodexCliSessionRepository);
  });
});
