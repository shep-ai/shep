'use server';

import { resolve } from '@/lib/server-container';
import type { ConnectGithubUseCase } from '@shepai/core/application/use-cases/integrations/connect-github.use-case';
import type { DisconnectGithubUseCase } from '@shepai/core/application/use-cases/integrations/disconnect-github.use-case';
import type { GetGithubIntegrationStatusUseCase } from '@shepai/core/application/use-cases/integrations/get-github-integration-status.use-case';
import type { GithubIntegrationStatus } from '@shepai/core/application/ports/output/repositories/github-integration.repository.interface';

export interface ConnectGithubResult {
  success: boolean;
  /** GitHub login that the token authenticated as. Present on success. */
  login?: string;
  error?: string;
}

export async function connectGithubAction(token: string): Promise<ConnectGithubResult> {
  try {
    const useCase = resolve<ConnectGithubUseCase>('ConnectGithubUseCase');
    const { login } = await useCase.execute({ token });
    return { success: true, login };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export async function disconnectGithubAction(): Promise<{ success: boolean; error?: string }> {
  try {
    const useCase = resolve<DisconnectGithubUseCase>('DisconnectGithubUseCase');
    await useCase.execute();
    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export async function getGithubStatusAction(): Promise<GithubIntegrationStatus> {
  const useCase = resolve<GetGithubIntegrationStatusUseCase>('GetGithubIntegrationStatusUseCase');
  return useCase.execute();
}
