import 'reflect-metadata';
import { describe, it, expect } from 'vitest';

import { NodeVersionDiagnostic } from '@/application/use-cases/doctor/diagnostics/node-version.diagnostic.js';
import { DiagnosticStatus } from '@/domain/generated/output.js';

describe('NodeVersionDiagnostic', () => {
  it('returns ok when Node major >= 22', async () => {
    const result = await new NodeVersionDiagnostic('v22.5.1').run();
    expect(result.status).toBe(DiagnosticStatus.Ok);
    expect(result.detail).toContain('v22.5.1');
  });

  it('returns fail when Node major < 22', async () => {
    const result = await new NodeVersionDiagnostic('v18.20.0').run();
    expect(result.status).toBe(DiagnosticStatus.Fail);
    expect(result.fixHint).toBeDefined();
    expect(result.detail).toContain('v18.20.0');
  });

  it('returns fail with fixHint when version cannot be parsed', async () => {
    const result = await new NodeVersionDiagnostic('garbage').run();
    expect(result.status).toBe(DiagnosticStatus.Fail);
    expect(result.fixHint).toBeDefined();
  });

  it('treats Node 22 as minimum acceptable', async () => {
    const result = await new NodeVersionDiagnostic('v22.0.0').run();
    expect(result.status).toBe(DiagnosticStatus.Ok);
  });
});
