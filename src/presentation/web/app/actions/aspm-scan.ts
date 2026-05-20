'use server';

/**
 * ASPM scan server actions (Phase 11, task-77).
 *
 * Replaces the upload-first ingest UX with native scan/rescan. Exposes:
 *   - startScan(formData): triggers ScanApplicationUseCase
 *   - rescanApplication(formData): triggers RescanApplicationUseCase
 *   - listScanRuns(applicationId): returns the latest N runs for the UI history
 *
 * Same gate + return-shape conventions as aspm-ingest.ts:
 *   { ok: boolean; summary?: ...; error?: string }
 */

import { revalidatePath } from 'next/cache';
import { resolve } from '@/lib/server-container';
import { requireFeatureFlag, FeatureFlagDisabledError } from '@/lib/feature-flags';
import type {
  ScanApplicationUseCase,
  ScanApplicationResult,
} from '@shepai/core/application/use-cases/aspm/scan/scan-application';
import type { RescanApplicationUseCase } from '@shepai/core/application/use-cases/aspm/scan/rescan-application';
import type { ListScanRunsUseCase } from '@shepai/core/application/use-cases/aspm/scan/list-scan-runs';
import type { ScanRun, ScanStageName, ScanTrigger } from '@shepai/core/domain/generated/output';

export interface AspmScanSummary {
  scanRunId: string;
  applicationId: string;
  status: ScanApplicationResult['status'];
  findingsInserted: number;
  stages: ScanApplicationResult['stages'];
}

export interface AspmScanActionResult {
  ok: boolean;
  summary?: AspmScanSummary;
  error?: string;
}

const VALID_STAGES: ReadonlySet<string> = new Set([
  'sbom',
  'sca',
  'secrets',
  'sast',
  'container',
  'iac',
]);

function readString(formData: FormData, name: string, fallback?: string): string {
  const raw = formData.get(name);
  if (typeof raw === 'string' && raw.trim().length > 0) return raw.trim();
  if (fallback !== undefined) return fallback;
  throw new Error(`Missing form field: ${name}`);
}

function readStages(formData: FormData): ScanStageName[] | undefined {
  const raw = formData.getAll('stages');
  if (raw.length === 0) return undefined;
  const parsed = raw
    .filter((v): v is string => typeof v === 'string')
    .filter((v) => VALID_STAGES.has(v));
  return parsed.length > 0 ? (parsed as ScanStageName[]) : undefined;
}

function readTrigger(formData: FormData): ScanTrigger | undefined {
  const raw = formData.get('triggeredBy');
  if (typeof raw !== 'string') return undefined;
  if (raw === 'User' || raw === 'Schedule' || raw === 'Event') return raw as ScanTrigger;
  return undefined;
}

function toSummary(applicationId: string, result: ScanApplicationResult): AspmScanSummary {
  return {
    scanRunId: result.scanRunId,
    applicationId,
    status: result.status,
    findingsInserted: result.findingsInserted,
    stages: result.stages,
  };
}

export async function startScan(formData: FormData): Promise<AspmScanActionResult> {
  try {
    requireFeatureFlag('aspm');
    const applicationId = readString(formData, 'applicationId');
    const stagesEnabled = readStages(formData);
    const triggeredBy = readTrigger(formData);

    const useCase = resolve<ScanApplicationUseCase>('ScanApplicationUseCase');
    const result = await useCase.execute({ applicationId, stagesEnabled, triggeredBy });
    revalidatePath('/aspm', 'layout');
    return { ok: true, summary: toSummary(applicationId, result) };
  } catch (err) {
    if (err instanceof FeatureFlagDisabledError) return { ok: false, error: err.message };
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function rescanApplication(formData: FormData): Promise<AspmScanActionResult> {
  try {
    requireFeatureFlag('aspm');
    const applicationId = readString(formData, 'applicationId');
    const stagesEnabled = readStages(formData);
    const triggeredBy = readTrigger(formData) ?? ('User' as ScanTrigger);

    const useCase = resolve<RescanApplicationUseCase>('RescanApplicationUseCase');
    const result = await useCase.execute({ applicationId, stagesEnabled, triggeredBy });
    revalidatePath('/aspm', 'layout');
    return { ok: true, summary: toSummary(applicationId, result) };
  } catch (err) {
    if (err instanceof FeatureFlagDisabledError) return { ok: false, error: err.message };
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function listScanRuns(
  applicationId: string,
  limit = 20
): Promise<{ ok: boolean; runs?: ScanRun[]; error?: string }> {
  try {
    requireFeatureFlag('aspm');
    const useCase = resolve<ListScanRunsUseCase>('ListScanRunsUseCase');
    const runs = await useCase.execute({ applicationId, limit });
    return { ok: true, runs };
  } catch (err) {
    if (err instanceof FeatureFlagDisabledError) return { ok: false, error: err.message };
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
