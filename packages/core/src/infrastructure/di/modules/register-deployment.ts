import { instanceCachingFactory, type DependencyContainer } from 'tsyringe';
import type Database from 'better-sqlite3';

import { StartApplicationDeploymentUseCase } from '../../../application/use-cases/deployments/start-application-deployment.use-case.js';
import { StartFeatureDeploymentUseCase } from '../../../application/use-cases/deployments/start-feature-deployment.use-case.js';
import { StartRepositoryDeploymentUseCase } from '../../../application/use-cases/deployments/start-repository-deployment.use-case.js';
import { StopDeploymentUseCase } from '../../../application/use-cases/deployments/stop-deployment.use-case.js';
import { GetDeploymentStatusUseCase } from '../../../application/use-cases/deployments/get-deployment-status.use-case.js';
import { ListDeploymentsUseCase } from '../../../application/use-cases/deployments/list-deployments.use-case.js';
import type { IDeploymentService } from '../../../application/ports/output/services/deployment-service.interface.js';
import type { IDevServerAgentService } from '../../../application/ports/output/services/dev-server-agent-service.interface.js';
import type { IDevServerRunPlanRepository } from '../../../application/ports/output/repositories/dev-server-run-plan-repository.interface.js';
import type { IAgentExecutorProvider } from '../../../application/ports/output/agents/agent-executor-provider.interface.js';
import type { IStructuredAgentCaller } from '../../../application/ports/output/agents/structured-agent-caller.interface.js';
import { SQLiteDevServerRunPlanRepository } from '../../repositories/sqlite-dev-server-run-plan.repository.js';
import { DevServerAgentService } from '../../services/agents/dev-server-agent/dev-server-agent.service.js';

/**
 * Resolve a token, degrading to null when it is not registered. Used for
 * the agent-facing dependencies of the dev-server agent: a missing executor
 * provider or structured caller must degrade the graph to deterministic-only
 * operation, never break container bootstrap (spec 103 research decision).
 */
function safeResolve<T>(container: DependencyContainer, token: string): T | null {
  try {
    return container.resolve<T>(token);
  } catch {
    return null;
  }
}

/**
 * Register local-deployment use cases and the agentic dev-server services
 * (spec 103). The `IDeploymentService` instance itself is constructed
 * eagerly in container.ts (it calls `recoverAll()` at startup).
 */
export function registerDeployment(container: DependencyContainer): void {
  container.register<IDevServerRunPlanRepository>('IDevServerRunPlanRepository', {
    useFactory: instanceCachingFactory<IDevServerRunPlanRepository>((c) => {
      const db = c.resolve<Database.Database>('Database');
      return new SQLiteDevServerRunPlanRepository(db);
    }),
  });

  // Cached instance — the service owns the single-flight run registry, so
  // every consumer must share ONE instance.
  container.register<IDevServerAgentService>('IDevServerAgentService', {
    useFactory: instanceCachingFactory<IDevServerAgentService>(
      (c) =>
        new DevServerAgentService({
          deploymentService: c.resolve<IDeploymentService>('IDeploymentService'),
          runPlanRepository: c.resolve<IDevServerRunPlanRepository>('IDevServerRunPlanRepository'),
          executorProvider: safeResolve<IAgentExecutorProvider>(c, 'IAgentExecutorProvider'),
          structuredCaller: safeResolve<IStructuredAgentCaller>(c, 'IStructuredAgentCaller'),
        })
    ),
  });

  container.registerSingleton(StartApplicationDeploymentUseCase);
  container.registerSingleton(StartFeatureDeploymentUseCase);
  container.registerSingleton(StartRepositoryDeploymentUseCase);
  container.registerSingleton(StopDeploymentUseCase);
  container.registerSingleton(GetDeploymentStatusUseCase);
  container.registerSingleton(ListDeploymentsUseCase);

  // String-token aliases for web routes (Turbopack can't resolve .js→.ts
  // imports inside @shepai/core, so routes use string tokens instead of class refs)
  container.register('StartApplicationDeploymentUseCase', {
    useFactory: (c) => c.resolve(StartApplicationDeploymentUseCase),
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
}
