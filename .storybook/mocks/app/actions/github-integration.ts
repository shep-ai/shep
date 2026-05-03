import type { GithubIntegrationStatus } from '@shepai/core/application/ports/output/repositories/github-integration.repository.interface';

export interface ConnectGithubResult {
  success: boolean;
  login?: string;
  error?: string;
}

export async function connectGithubAction(_token: string): Promise<ConnectGithubResult> {
  return { success: true, login: 'mock-user' };
}

export async function disconnectGithubAction(): Promise<{ success: boolean; error?: string }> {
  return { success: true };
}

export async function getGithubStatusAction(): Promise<GithubIntegrationStatus> {
  return { connected: false, connectedAt: null, updatedAt: null };
}
