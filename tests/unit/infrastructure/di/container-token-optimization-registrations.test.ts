/**
 * DI Container Registration Tests — Token Optimization Layer
 *
 * Verifies that all 7 token optimization services are registered with their
 * port interface tokens and resolve to the correct implementations.
 *
 * Services covered:
 *   - ICommandOutputFilterService
 *   - ISkillRoutingService
 *   - IDeltaContextService
 *   - ISemanticCompressorService
 *   - IAliasCompressionService
 *   - IPromptOptimizerService
 *   - IOptimizationMetricsService
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock native/heavy dependencies that container.ts transitively imports
vi.mock('node-notifier', () => ({ default: { notify: vi.fn() } }));
vi.mock('which', () => ({ default: vi.fn().mockResolvedValue(null) }));
vi.mock('better-sqlite3', () => ({
  default: vi.fn().mockReturnValue({
    pragma: vi.fn(),
    exec: vi.fn(),
    prepare: vi.fn().mockReturnValue({
      run: vi.fn(),
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
      run: vi.fn(),
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

describe('token optimization DI registrations', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('resolves ICommandOutputFilterService as CommandOutputFilterService', async () => {
    const { initializeContainer } = await import(
      '../../../../packages/core/src/infrastructure/di/container.js'
    );
    const { CommandOutputFilterService } = await import(
      '../../../../packages/core/src/infrastructure/services/token-optimization/command-output-filter.service.js'
    );

    const container = await initializeContainer();
    const svc = container.resolve('ICommandOutputFilterService');
    expect(svc).toBeInstanceOf(CommandOutputFilterService);
  });

  it('resolves ISkillRoutingService as SkillRoutingService', async () => {
    const { initializeContainer } = await import(
      '../../../../packages/core/src/infrastructure/di/container.js'
    );
    const { SkillRoutingService } = await import(
      '../../../../packages/core/src/infrastructure/services/token-optimization/skill-routing.service.js'
    );

    const container = await initializeContainer();
    const svc = container.resolve('ISkillRoutingService');
    expect(svc).toBeInstanceOf(SkillRoutingService);
  });

  it('resolves IDeltaContextService as DeltaContextService', async () => {
    const { initializeContainer } = await import(
      '../../../../packages/core/src/infrastructure/di/container.js'
    );
    const { DeltaContextService } = await import(
      '../../../../packages/core/src/infrastructure/services/token-optimization/delta-context.service.js'
    );

    const container = await initializeContainer();
    const svc = container.resolve('IDeltaContextService');
    expect(svc).toBeInstanceOf(DeltaContextService);
  });

  it('resolves ISemanticCompressorService as SemanticCompressorService', async () => {
    const { initializeContainer } = await import(
      '../../../../packages/core/src/infrastructure/di/container.js'
    );
    const { SemanticCompressorService } = await import(
      '../../../../packages/core/src/infrastructure/services/token-optimization/semantic-compressor.service.js'
    );

    const container = await initializeContainer();
    const svc = container.resolve('ISemanticCompressorService');
    expect(svc).toBeInstanceOf(SemanticCompressorService);
  });

  it('resolves IAliasCompressionService as AliasCompressionService', async () => {
    const { initializeContainer } = await import(
      '../../../../packages/core/src/infrastructure/di/container.js'
    );
    const { AliasCompressionService } = await import(
      '../../../../packages/core/src/infrastructure/services/token-optimization/alias-compression.service.js'
    );

    const container = await initializeContainer();
    const svc = container.resolve('IAliasCompressionService');
    expect(svc).toBeInstanceOf(AliasCompressionService);
  });

  it('resolves IPromptOptimizerService as PromptOptimizerService', async () => {
    const { initializeContainer } = await import(
      '../../../../packages/core/src/infrastructure/di/container.js'
    );
    const { PromptOptimizerService } = await import(
      '../../../../packages/core/src/infrastructure/services/token-optimization/prompt-optimizer.service.js'
    );

    const container = await initializeContainer();
    const svc = container.resolve('IPromptOptimizerService');
    expect(svc).toBeInstanceOf(PromptOptimizerService);
  });

  it('resolves IOptimizationMetricsService as OptimizationMetricsService', async () => {
    const { initializeContainer } = await import(
      '../../../../packages/core/src/infrastructure/di/container.js'
    );
    const { OptimizationMetricsService } = await import(
      '../../../../packages/core/src/infrastructure/services/token-optimization/optimization-metrics.service.js'
    );

    const container = await initializeContainer();
    const svc = container.resolve('IOptimizationMetricsService');
    expect(svc).toBeInstanceOf(OptimizationMetricsService);
  });
});
