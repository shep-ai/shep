/**
 * Connect GitHub Use Case
 *
 * Mints and stores a GitHub integration token via IGithubIntegrationRepository.
 * Throws InvalidGithubTokenError if the token is invalid or expired.
 */
import { inject, injectable } from 'tsyringe';

import type { IGithubIntegrationRepository } from '../../ports/output/repositories/github-integration.repository.interface.js';

export interface ConnectGithubInput {
  /** GitHub Personal Access Token (classic or fine-grained). */
  token: string;
}

export class InvalidGithubTokenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidGithubTokenError';
  }
}

const VALIDATE_URL = 'https://api.github.com/user';

@injectable()
export class ConnectGithubUseCase {
  constructor(
    @inject('IGithubIntegrationRepository')
    private readonly repo: IGithubIntegrationRepository
  ) {}

  async execute(input: ConnectGithubInput): Promise<{ login: string }> {
    const token = input.token?.trim();
    if (!token) throw new InvalidGithubTokenError('Token is required');

    // Probe the token before persisting — never store an invalid token.
    const res = await fetch(VALIDATE_URL, {
      headers: {
        Authorization: `Bearer ${token}`,
        'User-Agent': 'shep-github-integration',
        Accept: 'application/vnd.github+json',
      },
    });
    if (res.status === 401) {
      throw new InvalidGithubTokenError(
        'GitHub rejected the token (401). Check that the PAT is correct and has not expired.'
      );
    }
    if (!res.ok) {
      throw new InvalidGithubTokenError(
        `Could not validate token: GitHub returned ${res.status} ${res.statusText}`
      );
    }
    const body = (await res.json().catch(() => ({}))) as { login?: string };
    if (!body.login) {
      throw new InvalidGithubTokenError(
        'GitHub did not return a user — token may lack `read:user` scope'
      );
    }
    await this.repo.set(token);
    return { login: body.login };
  }
}
