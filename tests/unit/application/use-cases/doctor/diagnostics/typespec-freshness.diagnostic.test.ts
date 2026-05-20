import 'reflect-metadata';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, utimesSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { TypespecFreshnessDiagnostic } from '@/application/use-cases/doctor/diagnostics/typespec-freshness.diagnostic.js';
import type { IFileSystemService } from '@/application/ports/output/services/file-system-service.interface.js';
import { DiagnosticStatus } from '@/domain/generated/output.js';
import { existsSync } from 'node:fs';

function makeFs(): IFileSystemService {
  return {
    pathExists: (p: string) => existsSync(p),
    removeDirectory: async () => {
      /* unused */
    },
  };
}

const GENERATED_REL = path.join('packages', 'core', 'src', 'domain', 'generated');

describe('TypespecFreshnessDiagnostic', () => {
  let workspace: string;

  beforeEach(() => {
    workspace = mkdtempSync(path.join(tmpdir(), 'doctor-tsp-'));
    mkdirSync(path.join(workspace, 'tsp', 'domain'), { recursive: true });
    mkdirSync(path.join(workspace, GENERATED_REL), { recursive: true });
  });

  afterEach(() => {
    rmSync(workspace, { recursive: true, force: true });
  });

  it('returns ok when generated output is newer than the tsp sources', async () => {
    const tspFile = path.join(workspace, 'tsp', 'domain', 'a.tsp');
    writeFileSync(tspFile, 'model A {}');
    const generatedFile = path.join(workspace, GENERATED_REL, 'output.ts');
    writeFileSync(generatedFile, 'export {}');
    // Force generated mtime to be after tsp mtime.
    const past = new Date(Date.now() - 60_000);
    utimesSync(tspFile, past, past);
    const result = await new TypespecFreshnessDiagnostic(makeFs(), workspace).run();
    expect(result.status).toBe(DiagnosticStatus.Ok);
  });

  it('returns warn when tsp sources are newer than the generated output', async () => {
    const generatedFile = path.join(workspace, GENERATED_REL, 'output.ts');
    writeFileSync(generatedFile, 'export {}');
    // Force generated mtime to be in the past.
    const past = new Date(Date.now() - 60_000);
    utimesSync(generatedFile, past, past);
    const tspFile = path.join(workspace, 'tsp', 'domain', 'a.tsp');
    writeFileSync(tspFile, 'model A {}');
    const result = await new TypespecFreshnessDiagnostic(makeFs(), workspace).run();
    expect(result.status).toBe(DiagnosticStatus.Warn);
    expect(result.fixHint).toContain('tsp:compile');
  });

  it('returns fail when generated output is missing', async () => {
    writeFileSync(path.join(workspace, 'tsp', 'domain', 'a.tsp'), 'model A {}');
    const result = await new TypespecFreshnessDiagnostic(makeFs(), workspace).run();
    expect(result.status).toBe(DiagnosticStatus.Fail);
    expect(result.fixHint).toBeDefined();
  });
});
