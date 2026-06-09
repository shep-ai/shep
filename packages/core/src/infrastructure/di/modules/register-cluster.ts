import type { DependencyContainer } from 'tsyringe';
import type Database from 'better-sqlite3';

import type { IClusterRepository } from '../../../application/ports/output/repositories/cluster-repository.interface.js';
import { SQLiteClusterRepository } from '../../repositories/sqlite-cluster.repository.js';

import type { IK3dService } from '../../../application/ports/output/services/k3d-service.interface.js';
import { K3dService } from '../../services/k3d/k3d.service.js';
import type { IKubectlService } from '../../../application/ports/output/services/kubectl-service.interface.js';
import { KubectlService } from '../../services/kubectl/kubectl.service.js';
import type { IArgoCDService } from '../../../application/ports/output/services/argocd-service.interface.js';
import { ArgoCDService } from '../../services/argocd/argocd.service.js';
import type { IDockerHealthService } from '../../../application/ports/output/services/docker-health-service.interface.js';
import { DockerHealthService } from '../../services/docker/docker-health.service.js';
import type { IClusterAgentProcessService } from '../../../application/ports/output/services/cluster-agent-process-service.interface.js';
import { ClusterAgentProcessService } from '../../services/agents/cluster-agent/cluster-agent-process.service.js';

import { CreateClusterUseCase } from '../../../application/use-cases/clusters/create-cluster.use-case.js';
import { GetClusterUseCase } from '../../../application/use-cases/clusters/get-cluster.use-case.js';
import { ListClustersUseCase } from '../../../application/use-cases/clusters/list-clusters.use-case.js';
import { UpdateClusterUseCase } from '../../../application/use-cases/clusters/update-cluster.use-case.js';
import { DeleteClusterUseCase } from '../../../application/use-cases/clusters/delete-cluster.use-case.js';
import { LinkRepositoryUseCase } from '../../../application/use-cases/clusters/link-repository.use-case.js';
import { UnlinkRepositoryUseCase } from '../../../application/use-cases/clusters/unlink-repository.use-case.js';
import { LinkApplicationUseCase } from '../../../application/use-cases/clusters/link-application.use-case.js';
import { UnlinkApplicationUseCase } from '../../../application/use-cases/clusters/unlink-application.use-case.js';
import { ProvisionClusterUseCase } from '../../../application/use-cases/clusters/provision-cluster.use-case.js';
import { DestroyClusterUseCase } from '../../../application/use-cases/clusters/destroy-cluster.use-case.js';
import { GetClusterStatusUseCase } from '../../../application/use-cases/clusters/get-cluster-status.use-case.js';

/**
 * Register all cluster-related components: repository, infrastructure services,
 * agent process service, and use cases.
 *
 * Depends on: 'Database', 'ExecFunction', 'IApplicationRepository',
 * 'IRepositoryRepository', 'IFileSystemService' tokens being registered first.
 */
export function registerCluster(container: DependencyContainer): void {
  // ─── Repository ───────────────────────────────────────────────────────────
  container.register<IClusterRepository>('IClusterRepository', {
    useFactory: (c) => new SQLiteClusterRepository(c.resolve<Database.Database>('Database')),
  });

  // ─── Infrastructure services ──────────────────────────────────────────────
  container.registerSingleton<IK3dService>('IK3dService', K3dService);
  container.registerSingleton<IKubectlService>('IKubectlService', KubectlService);
  container.registerSingleton<IArgoCDService>('IArgoCDService', ArgoCDService);
  container.registerSingleton<IDockerHealthService>('IDockerHealthService', DockerHealthService);

  container.register<IClusterAgentProcessService>('IClusterAgentProcessService', {
    useFactory: () => new ClusterAgentProcessService(),
  });

  // ─── Use cases ────────────────────────────────────────────────────────────
  container.registerSingleton(CreateClusterUseCase);
  container.registerSingleton(GetClusterUseCase);
  container.registerSingleton(ListClustersUseCase);
  container.registerSingleton(UpdateClusterUseCase);
  container.registerSingleton(DeleteClusterUseCase);
  container.registerSingleton(LinkRepositoryUseCase);
  container.registerSingleton(UnlinkRepositoryUseCase);
  container.registerSingleton(LinkApplicationUseCase);
  container.registerSingleton(UnlinkApplicationUseCase);
  container.registerSingleton(ProvisionClusterUseCase);
  container.registerSingleton(DestroyClusterUseCase);
  container.registerSingleton(GetClusterStatusUseCase);

  // ─── String-token aliases for web routes ──────────────────────────────────
  container.register('CreateClusterUseCase', {
    useFactory: (c) => c.resolve(CreateClusterUseCase),
  });
  container.register('GetClusterUseCase', {
    useFactory: (c) => c.resolve(GetClusterUseCase),
  });
  container.register('ListClustersUseCase', {
    useFactory: (c) => c.resolve(ListClustersUseCase),
  });
  container.register('UpdateClusterUseCase', {
    useFactory: (c) => c.resolve(UpdateClusterUseCase),
  });
  container.register('DeleteClusterUseCase', {
    useFactory: (c) => c.resolve(DeleteClusterUseCase),
  });
  container.register('LinkRepositoryUseCase', {
    useFactory: (c) => c.resolve(LinkRepositoryUseCase),
  });
  container.register('UnlinkRepositoryUseCase', {
    useFactory: (c) => c.resolve(UnlinkRepositoryUseCase),
  });
  container.register('LinkApplicationUseCase', {
    useFactory: (c) => c.resolve(LinkApplicationUseCase),
  });
  container.register('UnlinkApplicationUseCase', {
    useFactory: (c) => c.resolve(UnlinkApplicationUseCase),
  });
  container.register('ProvisionClusterUseCase', {
    useFactory: (c) => c.resolve(ProvisionClusterUseCase),
  });
  container.register('DestroyClusterUseCase', {
    useFactory: (c) => c.resolve(DestroyClusterUseCase),
  });
  container.register('GetClusterStatusUseCase', {
    useFactory: (c) => c.resolve(GetClusterStatusUseCase),
  });
}
