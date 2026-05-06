import 'reflect-metadata';
import { describe, it, expect, vi } from 'vitest';

import { GhCliAuthDiagnostic } from '@/application/use-cases/doctor/diagnostics/gh-cli-auth.diagnostic.js';
import {
  GitHubAuthError,
  type IGitHubRepositoryService,
} from '@/application/ports/output/services/github-repository-service.interface.js';
import { DiagnosticStatus } from '@/domain/generated/output.js';

function makeService(impl: Partial<IGitHubRepositoryService> = {}): IGitHubRepositoryService {
  return {
    checkAuth: vi.fn(),
    cloneRepository: vi.fn(),
    listUserRepositories: vi.fn(),
    listOrganizations: vi.fn(),
    parseGitHubUrl: vi.fn(),
    getViewerPermission: vi.fn(),
    getAuthenticatedUser: vi.fn(),
    checkPushAccess: vi.fn(),
    forkRepository: vi.fn(),
    ...impl,
  } as unknown as IGitHubRepositoryService;
}

describe('GhCliAuthDiagnostic', () => {
  it('returns ok when checkAuth succeeds', async () => {
    const service = makeService({ checkAuth: vi.fn().mockResolvedValue(undefined) });
    const result = await new GhCliAuthDiagnostic(service).run();
    expect(result.status).toBe(DiagnosticStatus.Ok);
  });

  it('returns warn with fixHint on GitHubAuthError', async () => {
    const service = makeService({
      checkAuth: vi.fn().mockRejectedValue(new GitHubAuthError('not logged in')),
    });
    const result = await new GhCliAuthDiagnostic(service).run();
    expect(result.status).toBe(DiagnosticStatus.Warn);
    expect(result.fixHint).toContain('gh auth login');
  });

  it('returns fail on unexpected errors', async () => {
    const service = makeService({
      checkAuth: vi.fn().mockRejectedValue(new Error('network down')),
    });
    const result = await new GhCliAuthDiagnostic(service).run();
    expect(result.status).toBe(DiagnosticStatus.Fail);
    expect(result.detail).toContain('network down');
  });
});
