/**
 * Guards the doctor's DI wiring.
 *
 * `DiagnosticRunner`'s only constructor parameter is an options bag that erases
 * to `Object` at runtime, so binding the token with `registerSingleton` makes
 * resolution depend on emitted decorator metadata being present. Where that
 * metadata is stripped (the Next/Turbopack build of the web surface), tsyringe
 * raises "TypeInfo not known for DiagnosticRunner" and the user is shown
 * "Environment check unavailable" instead of a report. Binding a ready-made
 * instance keeps resolution off the reflective path entirely.
 */

import 'reflect-metadata';
import { describe, it, expect } from 'vitest';
import { container } from 'tsyringe';

import { registerServices } from '@/infrastructure/di/modules/register-services.js';
import { DiagnosticRunner } from '@/infrastructure/services/doctor/diagnostic-runner.service.js';
import { DiagnosticStatus } from '@/domain/generated/output.js';
import type {
  IDiagnostic,
  IDiagnosticRunner,
} from '@/application/ports/output/services/diagnostic.interface.js';

const TOKEN = 'IDiagnosticRunner';

function okDiagnostic(name: string): IDiagnostic {
  return {
    name,
    run: async () => ({ name, status: DiagnosticStatus.Ok, detail: 'fine', durationMs: 0 }),
  } as IDiagnostic;
}

describe('IDiagnosticRunner registration', () => {
  it('resolves to a usable DiagnosticRunner', async () => {
    const c = container.createChildContainer();
    registerServices(c);

    const runner = c.resolve<IDiagnosticRunner>(TOKEN);
    expect(runner).toBeInstanceOf(DiagnosticRunner);

    const report = await runner.runAll([okDiagnostic('a'), okDiagnostic('b')]);
    expect(report.overallStatus).toBe(DiagnosticStatus.Ok);
    expect(report.results).toHaveLength(2);
  });
});
