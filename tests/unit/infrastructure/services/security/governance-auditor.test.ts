/**
 * Governance Auditor Unit Tests
 *
 * Tests the gh-CLI-backed governance audit in GitHubRepositoryService:
 * - Branch protection gap detection
 * - CODEOWNERS presence checks
 * - Auth/permission error handling (returns Unknown finding, not crash)
 */

import 'reflect-metadata';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { GitHubRepositoryService } from '@/infrastructure/services/external/github-repository.service.js';
import { GovernanceFindingCategory } from '@/application/ports/output/services/github-repository-service.interface.js';
import type { ExecFunction } from '@/infrastructure/services/git/worktree.service.js';

describe('GitHubRepositoryService.auditRepositoryGovernance', () => {
  let service: GitHubRepositoryService;
  let mockExec: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockExec = vi.fn();
    service = new GitHubRepositoryService(mockExec as ExecFunction);
  });

  it('should return no findings when branch protection is enabled and CODEOWNERS exists', async () => {
    // Branch protection returns valid response
    mockExec.mockImplementation((cmd: string, args: string[]) => {
      const argsStr = args.join(' ');
      if (argsStr.includes('/branches/main/protection')) {
        return Promise.resolve({
          stdout: JSON.stringify({
            required_pull_request_reviews: { required_approving_review_count: 1 },
            enforce_admins: { enabled: true },
          }),
          stderr: '',
        });
      }
      if (
        argsStr.includes('/contents/CODEOWNERS') ||
        argsStr.includes('/contents/.github/CODEOWNERS')
      ) {
        return Promise.resolve({
          stdout: JSON.stringify({ name: 'CODEOWNERS', type: 'file' }),
          stderr: '',
        });
      }
      return Promise.resolve({ stdout: '{}', stderr: '' });
    });

    const findings = await service.auditRepositoryGovernance('octocat', 'my-project');
    expect(findings).toHaveLength(0);
  });

  it('should report branch protection gap when API returns 404', async () => {
    mockExec.mockImplementation((cmd: string, args: string[]) => {
      const argsStr = args.join(' ');
      if (argsStr.includes('/branches/main/protection')) {
        // 404 = no branch protection configured
        const error = new Error('HTTP 404: Not Found');
        (error as NodeJS.ErrnoException).code = undefined;
        return Promise.reject(error);
      }
      if (
        argsStr.includes('/contents/CODEOWNERS') ||
        argsStr.includes('/contents/.github/CODEOWNERS')
      ) {
        return Promise.resolve({
          stdout: JSON.stringify({ name: 'CODEOWNERS', type: 'file' }),
          stderr: '',
        });
      }
      return Promise.resolve({ stdout: '{}', stderr: '' });
    });

    const findings = await service.auditRepositoryGovernance('octocat', 'my-project');
    const branchFinding = findings.find(
      (f) => f.category === GovernanceFindingCategory.BranchProtection
    );
    expect(branchFinding).toBeDefined();
    expect(branchFinding!.severity).toBe('High');
    expect(branchFinding!.remediation).toBeTruthy();
  });

  it('should report CODEOWNERS missing when file not found', async () => {
    mockExec.mockImplementation((cmd: string, args: string[]) => {
      const argsStr = args.join(' ');
      if (argsStr.includes('/branches/main/protection')) {
        return Promise.resolve({
          stdout: JSON.stringify({
            required_pull_request_reviews: { required_approving_review_count: 1 },
          }),
          stderr: '',
        });
      }
      if (
        argsStr.includes('/contents/CODEOWNERS') ||
        argsStr.includes('/contents/.github/CODEOWNERS')
      ) {
        return Promise.reject(new Error('HTTP 404: Not Found'));
      }
      return Promise.resolve({ stdout: '{}', stderr: '' });
    });

    const findings = await service.auditRepositoryGovernance('octocat', 'my-project');
    const codeownersFinding = findings.find(
      (f) => f.category === GovernanceFindingCategory.Codeowners
    );
    expect(codeownersFinding).toBeDefined();
    expect(codeownersFinding!.severity).toBe('Medium');
  });

  it('should return Unknown severity finding on auth error instead of crashing', async () => {
    mockExec.mockImplementation(() => {
      const error = new Error('HTTP 401: Unauthorized');
      return Promise.reject(error);
    });

    const findings = await service.auditRepositoryGovernance('octocat', 'my-project');

    // Should not throw — should return findings gracefully
    expect(findings.length).toBeGreaterThan(0);
    const unknownFinding = findings.find((f) => f.severity === 'Unknown');
    expect(unknownFinding).toBeDefined();
  });

  it('should use custom default branch when provided', async () => {
    mockExec.mockImplementation((cmd: string, args: string[]) => {
      const argsStr = args.join(' ');
      if (argsStr.includes('/branches/develop/protection')) {
        return Promise.resolve({
          stdout: JSON.stringify({
            required_pull_request_reviews: { required_approving_review_count: 1 },
          }),
          stderr: '',
        });
      }
      if (
        argsStr.includes('/contents/CODEOWNERS') ||
        argsStr.includes('/contents/.github/CODEOWNERS')
      ) {
        return Promise.resolve({
          stdout: JSON.stringify({ name: 'CODEOWNERS', type: 'file' }),
          stderr: '',
        });
      }
      return Promise.resolve({ stdout: '{}', stderr: '' });
    });

    const findings = await service.auditRepositoryGovernance('octocat', 'my-project', 'develop');

    // Should have used 'develop' in the API call
    expect(mockExec).toHaveBeenCalledWith(
      'gh',
      expect.arrayContaining([expect.stringContaining('/branches/develop/protection')])
    );
    expect(findings).toHaveLength(0);
  });

  it('should handle ENOENT (gh not installed) as Unknown finding', async () => {
    mockExec.mockImplementation(() => {
      const error = new Error('spawn gh ENOENT') as NodeJS.ErrnoException;
      error.code = 'ENOENT';
      return Promise.reject(error);
    });

    const findings = await service.auditRepositoryGovernance('octocat', 'my-project');
    expect(findings.length).toBeGreaterThan(0);
    const unknownFinding = findings.find((f) => f.severity === 'Unknown');
    expect(unknownFinding).toBeDefined();
    expect(unknownFinding!.message).toContain('gh');
  });
});
