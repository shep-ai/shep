'use server';

/**
 * runDoctor — server action wrapping RunDoctorUseCase for the contributor
 * onboarding view (spec 097, task-47). Resolves the use case from the DI
 * container and returns the report; gracefully reports `{ error }` if the
 * doctor pipeline isn't fully wired in this environment.
 */

import { resolve } from '@/lib/server-container';
import type { RunDoctorUseCase } from '@shepai/core/application/use-cases/doctor/run-doctor.use-case';
import type { DoctorSummaryReport } from '@/components/contributors/DoctorSummary';

export interface RunDoctorActionResult {
  report?: DoctorSummaryReport;
  error?: string;
}

export async function runDoctor(): Promise<RunDoctorActionResult> {
  try {
    const useCase = resolve<RunDoctorUseCase>('RunDoctorUseCase');
    const report = await useCase.execute();
    return {
      report: {
        results: report.results.map((r) => ({
          name: r.name,
          status: r.status,
          detail: r.detail,
          fixHint: r.fixHint,
        })),
        overallStatus: report.overallStatus,
        summary: report.summary,
      },
    };
  } catch (error: unknown) {
    return { error: error instanceof Error ? error.message : 'Failed to run doctor' };
  }
}
