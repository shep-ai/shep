/**
 * Cluster Agent Graph Dependencies
 *
 * Typed dependency interface injected into the graph factory so nodes
 * access infrastructure services through ports, not direct imports.
 */

import type { IK3dService } from '../../../../application/ports/output/services/k3d-service.interface.js';
import type { IKubectlService } from '../../../../application/ports/output/services/kubectl-service.interface.js';
import type { IArgoCDService } from '../../../../application/ports/output/services/argocd-service.interface.js';
import type { IDockerHealthService } from '../../../../application/ports/output/services/docker-health-service.interface.js';
import type { IClusterRepository } from '../../../../application/ports/output/repositories/cluster-repository.interface.js';

export interface ClusterAgentDeps {
  k3dService: IK3dService;
  kubectlService: IKubectlService;
  argoCdService: IArgoCDService;
  dockerHealthService: IDockerHealthService;
  clusterRepo: IClusterRepository;
}
