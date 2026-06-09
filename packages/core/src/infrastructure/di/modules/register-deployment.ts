import type { DependencyContainer } from 'tsyringe';

import { StartApplicationDeploymentUseCase } from '../../../application/use-cases/deployments/start-application-deployment.use-case.js';
import { StartFeatureDeploymentUseCase } from '../../../application/use-cases/deployments/start-feature-deployment.use-case.js';
import { StartRepositoryDeploymentUseCase } from '../../../application/use-cases/deployments/start-repository-deployment.use-case.js';
import { StopDeploymentUseCase } from '../../../application/use-cases/deployments/stop-deployment.use-case.js';
import { GetDeploymentStatusUseCase } from '../../../application/use-cases/deployments/get-deployment-status.use-case.js';
import { ListDeploymentsUseCase } from '../../../application/use-cases/deployments/list-deployments.use-case.js';
import type { IDevEnvironmentAgent } from '../../../application/ports/output/services/dev-environment-agent.interface.js';
import { DevEnvironmentAgentService } from '../../services/deployment/dev-environment-agent.service.js';
import type { IAgentDeploymentService } from '../../../application/ports/output/services/agent-deployment-service.interface.js';
import { AgentDeploymentService } from '../../services/deployment/agent-deployment.service.js';
import type { IStructuredAgentCaller } from '../../../application/ports/output/agents/structured-agent-caller.interface.js';
import type { IDeploymentService } from '../../../application/ports/output/services/deployment-service.interface.js';

/**
 * Register local-deployment use cases and agent-based deployment services.
 * The `IDeploymentService` instance itself is constructed eagerly in container.ts
 * (it calls `recoverAll()` at startup).
 */
export function registerDeployment(container: DependencyContainer): void {
  // Agent-based deployment services (dev environment analysis)
  container.register<IDevEnvironmentAgent>('IDevEnvironmentAgent', {
    useFactory: (c) => {
      const caller = c.resolve<IStructuredAgentCaller>('IStructuredAgentCaller');
      return new DevEnvironmentAgentService({ structuredAgentCaller: caller });
    },
  });
  container.register<IAgentDeploymentService>('IAgentDeploymentService', {
    useFactory: (c) => {
      const devEnvAgent = c.resolve<IDevEnvironmentAgent>('IDevEnvironmentAgent');
      const deploySvc = c.resolve<IDeploymentService>('IDeploymentService');
      return new AgentDeploymentService({
        devEnvironmentAgent: devEnvAgent,
        deploymentService: deploySvc,
      });
    },
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
