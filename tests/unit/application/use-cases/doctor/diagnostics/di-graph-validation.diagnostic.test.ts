import 'reflect-metadata';
import { describe, it, expect } from 'vitest';

import { DiGraphValidationDiagnostic } from '@/application/use-cases/doctor/diagnostics/di-graph-validation.diagnostic.js';
import { DiagnosticStatus } from '@/domain/generated/output.js';

describe('DiGraphValidationDiagnostic', () => {
  it('returns ok when every required token is registered', async () => {
    const result = await new DiGraphValidationDiagnostic(() => true, ['IFoo', 'IBar']).run();
    expect(result.status).toBe(DiagnosticStatus.Ok);
    expect(result.detail).toContain('2');
  });

  it('returns fail listing the missing tokens', async () => {
    const result = await new DiGraphValidationDiagnostic(
      (token) => token !== 'IBar',
      ['IFoo', 'IBar', 'IBaz']
    ).run();
    expect(result.status).toBe(DiagnosticStatus.Fail);
    expect(result.detail).toContain('IBar');
    expect(result.fixHint).toBeDefined();
  });

  it('returns fail when nothing is registered', async () => {
    const result = await new DiGraphValidationDiagnostic(() => false, ['IOnly']).run();
    expect(result.status).toBe(DiagnosticStatus.Fail);
    expect(result.detail).toContain('IOnly');
  });
});
