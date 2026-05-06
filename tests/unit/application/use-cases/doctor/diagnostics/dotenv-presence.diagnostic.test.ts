import 'reflect-metadata';
import path from 'node:path';
import { describe, it, expect, vi } from 'vitest';

import { DotenvPresenceDiagnostic } from '@/application/use-cases/doctor/diagnostics/dotenv-presence.diagnostic.js';
import type { IFileSystemService } from '@/application/ports/output/services/file-system-service.interface.js';
import { DiagnosticStatus } from '@/domain/generated/output.js';

function makeFs(exists: boolean): IFileSystemService {
  return {
    pathExists: vi.fn().mockReturnValue(exists),
    removeDirectory: vi.fn(),
  };
}

describe('DotenvPresenceDiagnostic', () => {
  it('returns ok when .env exists', async () => {
    const fs = makeFs(true);
    const result = await new DotenvPresenceDiagnostic(fs, '/repo').run();
    expect(result.status).toBe(DiagnosticStatus.Ok);
    expect(fs.pathExists).toHaveBeenCalledWith(path.join('/repo', '.env'));
  });

  it('returns warn with fixHint when .env is missing', async () => {
    const result = await new DotenvPresenceDiagnostic(makeFs(false), '/repo').run();
    expect(result.status).toBe(DiagnosticStatus.Warn);
    expect(result.fixHint).toBeDefined();
  });
});
