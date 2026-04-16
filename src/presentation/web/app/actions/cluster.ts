'use server';

import { resolve } from '@/lib/server-container';
import type { Cluster } from '@shepai/core/domain/generated/output';
import type { CreateClusterUseCase } from '@shepai/core/application/use-cases/clusters/create-cluster.use-case';
import type { GetClusterUseCase } from '@shepai/core/application/use-cases/clusters/get-cluster.use-case';
import type { ListClustersUseCase } from '@shepai/core/application/use-cases/clusters/list-clusters.use-case';
import type { UpdateClusterUseCase } from '@shepai/core/application/use-cases/clusters/update-cluster.use-case';
import type { DeleteClusterUseCase } from '@shepai/core/application/use-cases/clusters/delete-cluster.use-case';
import type { ProvisionClusterUseCase } from '@shepai/core/application/use-cases/clusters/provision-cluster.use-case';
import type { DestroyClusterUseCase } from '@shepai/core/application/use-cases/clusters/destroy-cluster.use-case';
import type { LinkRepositoryUseCase } from '@shepai/core/application/use-cases/clusters/link-repository.use-case';
import type { UnlinkRepositoryUseCase } from '@shepai/core/application/use-cases/clusters/unlink-repository.use-case';
import type { LinkApplicationUseCase } from '@shepai/core/application/use-cases/clusters/link-application.use-case';
import type { UnlinkApplicationUseCase } from '@shepai/core/application/use-cases/clusters/unlink-application.use-case';
import type { GetClusterStatusUseCase } from '@shepai/core/application/use-cases/clusters/get-cluster-status.use-case';

interface CreateClusterInput {
  name: string;
  description?: string;
  argoCdEnabled?: boolean;
}

export async function createCluster(
  input: CreateClusterInput
): Promise<{ cluster?: Cluster; error?: string }> {
  if (!input.name?.trim()) {
    return { error: 'Cluster name is required' };
  }

  try {
    const useCase = resolve<CreateClusterUseCase>('CreateClusterUseCase');
    const result = await useCase.execute({
      name: input.name.trim(),
      description: input.description,
      argoCdEnabled: input.argoCdEnabled,
    });
    if (!result.ok) return { error: result.error };
    return { cluster: result.cluster };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to create cluster';
    return { error: message };
  }
}

export async function getCluster(id: string): Promise<{ cluster?: Cluster; error?: string }> {
  try {
    const useCase = resolve<GetClusterUseCase>('GetClusterUseCase');
    const result = await useCase.execute(id);
    if (!result.ok) return { error: result.error };
    return { cluster: result.cluster };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to get cluster';
    return { error: message };
  }
}

export async function listClusters(): Promise<{ clusters?: Cluster[]; error?: string }> {
  try {
    const useCase = resolve<ListClustersUseCase>('ListClustersUseCase');
    const clusters = await useCase.execute();
    return { clusters };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to list clusters';
    return { error: message };
  }
}

export async function updateCluster(
  id: string,
  input: { name?: string; description?: string; argoCdEnabled?: boolean }
): Promise<{ cluster?: Cluster; error?: string }> {
  try {
    const useCase = resolve<UpdateClusterUseCase>('UpdateClusterUseCase');
    const result = await useCase.execute(id, input);
    if (!result.ok) return { error: result.error };
    return { cluster: result.cluster };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to update cluster';
    return { error: message };
  }
}

export async function deleteCluster(id: string): Promise<{ error?: string }> {
  try {
    const useCase = resolve<DeleteClusterUseCase>('DeleteClusterUseCase');
    const result = await useCase.execute(id);
    if (!result.ok) return { error: result.error };
    return {};
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to delete cluster';
    return { error: message };
  }
}

export async function provisionCluster(id: string): Promise<{ error?: string }> {
  try {
    const useCase = resolve<ProvisionClusterUseCase>('ProvisionClusterUseCase');
    const result = await useCase.execute(id);
    if (!result.ok) return { error: result.error };
    return {};
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to provision cluster';
    return { error: message };
  }
}

export async function destroyCluster(id: string): Promise<{ error?: string }> {
  try {
    const useCase = resolve<DestroyClusterUseCase>('DestroyClusterUseCase');
    const result = await useCase.execute(id);
    if (!result.ok) return { error: result.error };
    return {};
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to destroy cluster';
    return { error: message };
  }
}

export async function linkRepository(
  clusterId: string,
  repositoryId: string
): Promise<{ error?: string }> {
  try {
    const useCase = resolve<LinkRepositoryUseCase>('LinkRepositoryUseCase');
    const result = await useCase.execute({ clusterId, entityId: repositoryId });
    if (!result.ok) return { error: result.error };
    return {};
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to link repository';
    return { error: message };
  }
}

export async function unlinkRepository(
  clusterId: string,
  repositoryId: string
): Promise<{ error?: string }> {
  try {
    const useCase = resolve<UnlinkRepositoryUseCase>('UnlinkRepositoryUseCase');
    const result = await useCase.execute({ clusterId, entityId: repositoryId });
    if (!result.ok) return { error: result.error };
    return {};
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to unlink repository';
    return { error: message };
  }
}

export async function linkApplication(
  clusterId: string,
  applicationId: string
): Promise<{ error?: string }> {
  try {
    const useCase = resolve<LinkApplicationUseCase>('LinkApplicationUseCase');
    const result = await useCase.execute({ clusterId, entityId: applicationId });
    if (!result.ok) return { error: result.error };
    return {};
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to link application';
    return { error: message };
  }
}

export async function unlinkApplication(
  clusterId: string,
  applicationId: string
): Promise<{ error?: string }> {
  try {
    const useCase = resolve<UnlinkApplicationUseCase>('UnlinkApplicationUseCase');
    const result = await useCase.execute({ clusterId, entityId: applicationId });
    if (!result.ok) return { error: result.error };
    return {};
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to unlink application';
    return { error: message };
  }
}

export async function getClusterStatus(id: string): Promise<{ status?: unknown; error?: string }> {
  try {
    const useCase = resolve<GetClusterStatusUseCase>('GetClusterStatusUseCase');
    const result = await useCase.execute(id);
    if (!result.ok) return { error: result.error };
    return { status: result.status };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to get cluster status';
    return { error: message };
  }
}
