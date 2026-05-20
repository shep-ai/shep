import 'reflect-metadata';
import { describe, it, expect, vi } from 'vitest';

import { WorkingTreeCleanDiagnostic } from '@/application/use-cases/doctor/diagnostics/working-tree-clean.diagnostic.js';
import type { IGitPrService } from '@/application/ports/output/services/git-pr-service.interface.js';
import { DiagnosticStatus } from '@/domain/generated/output.js';

function makeGit(impl: Partial<IGitPrService>): IGitPrService {
  return impl as unknown as IGitPrService;
}

describe('WorkingTreeCleanDiagnostic', () => {
  it('returns ok when the tree is clean', async () => {
    const git = makeGit({ hasUncommittedChanges: vi.fn().mockResolvedValue(false) });
    const result = await new WorkingTreeCleanDiagnostic(git, '/repo').run();
    expect(result.status).toBe(DiagnosticStatus.Ok);
  });

  it('returns warn with fixHint when there are uncommitted changes', async () => {
    const git = makeGit({ hasUncommittedChanges: vi.fn().mockResolvedValue(true) });
    const result = await new WorkingTreeCleanDiagnostic(git, '/repo').run();
    expect(result.status).toBe(DiagnosticStatus.Warn);
    expect(result.fixHint).toBeDefined();
  });

  it('returns warn when the git service throws', async () => {
    const git = makeGit({
      hasUncommittedChanges: vi.fn().mockRejectedValue(new Error('not a git repo')),
    });
    const result = await new WorkingTreeCleanDiagnostic(git, '/repo').run();
    expect(result.status).toBe(DiagnosticStatus.Warn);
    expect(result.detail).toContain('not a git repo');
  });
});
