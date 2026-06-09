'use server';

/**
 * ASPM scan server actions (Phase 11, task-77).
 *
 * Replaces the upload-first ingest UX with native scan/rescan. Exposes:
 *   - startScan(formData):     triggers ScanApplicationUseCase (single app)
 *   - startBulkScan(formData): runs ScanApplicationUseCase N times for a JSON
 *                              list of targets (apps + feature worktrees)
 *   - rescanApplication(formData): triggers RescanApplicationUseCase
 *   - listScanRuns(applicationId): returns the latest N runs for the UI history
 *   - listAspmScanTargets():   returns the repo→app→feature tree the dialog
 *                              renders as a checkbox picker
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
import type {
  ListScanTargetsUseCase,
  ScanTargetTree,
} from '@shepai/core/application/use-cases/aspm/scan/list-scan-targets';
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

/**
 * One scan target the dialog can submit. A target always names an
 * application (findings attribution); when `scanPath` is set the scanner
 * walks that path instead of the application's `repositoryPath` so users
 * can scan a feature worktree from the same UI.
 */
export interface AspmBulkScanTarget {
  applicationId: string;
  scanPath?: string;
  /** Free-form label used only for surfacing per-target results to the UI. */
  label?: string;
}

export interface AspmBulkScanTargetResult {
  applicationId: string;
  label?: string;
  scanPath?: string;
  ok: boolean;
  summary?: AspmScanSummary;
  error?: string;
}

export interface AspmBulkScanResult {
  ok: boolean;
  results: AspmBulkScanTargetResult[];
  totals: {
    targets: number;
    succeeded: number;
    failed: number;
    findingsInserted: number;
  };
  error?: string;
}

function parseBulkTargets(formData: FormData): AspmBulkScanTarget[] {
  const raw = formData.get('targets');
  if (typeof raw !== 'string' || raw.length === 0) {
    throw new Error('Missing form field: targets');
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error(`Invalid targets JSON: ${err instanceof Error ? err.message : String(err)}`);
  }
  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error('targets must be a non-empty array');
  }
  const out: AspmBulkScanTarget[] = [];
  for (const entry of parsed) {
    if (typeof entry !== 'object' || entry === null) {
      throw new Error('Each target must be an object');
    }
    const obj = entry as Record<string, unknown>;
    const applicationId = obj.applicationId;
    if (typeof applicationId !== 'string' || applicationId.trim().length === 0) {
      throw new Error('Each target requires applicationId');
    }
    const target: AspmBulkScanTarget = { applicationId: applicationId.trim() };
    if (typeof obj.scanPath === 'string' && obj.scanPath.trim().length > 0) {
      target.scanPath = obj.scanPath.trim();
    }
    if (typeof obj.label === 'string' && obj.label.trim().length > 0) {
      target.label = obj.label.trim();
    }
    out.push(target);
  }
  return out;
}

export async function startBulkScan(formData: FormData): Promise<AspmBulkScanResult> {
  try {
    requireFeatureFlag('aspm');
    const targets = parseBulkTargets(formData);
    const stagesEnabled = readStages(formData);
    const triggeredBy = readTrigger(formData);

    const useCase = resolve<ScanApplicationUseCase>('ScanApplicationUseCase');
    const results: AspmBulkScanTargetResult[] = [];
    let succeeded = 0;
    let failed = 0;
    let findingsInserted = 0;

    for (const target of targets) {
      try {
        const input: Parameters<ScanApplicationUseCase['execute']>[0] = {
          applicationId: target.applicationId,
          stagesEnabled,
          triggeredBy,
        };
        if (target.scanPath) input.scanPath = target.scanPath;
        const result = await useCase.execute(input);
        results.push({
          applicationId: target.applicationId,
          label: target.label,
          scanPath: target.scanPath,
          ok: true,
          summary: toSummary(target.applicationId, result),
        });
        succeeded += 1;
        findingsInserted += result.findingsInserted;
      } catch (err) {
        results.push({
          applicationId: target.applicationId,
          label: target.label,
          scanPath: target.scanPath,
          ok: false,
          error: err instanceof Error ? err.message : String(err),
        });
        failed += 1;
      }
    }

    revalidatePath('/aspm', 'layout');
    return {
      ok: failed === 0,
      results,
      totals: { targets: targets.length, succeeded, failed, findingsInserted },
    };
  } catch (err) {
    if (err instanceof FeatureFlagDisabledError) {
      return {
        ok: false,
        results: [],
        totals: { targets: 0, succeeded: 0, failed: 0, findingsInserted: 0 },
        error: err.message,
      };
    }
    return {
      ok: false,
      results: [],
      totals: { targets: 0, succeeded: 0, failed: 0, findingsInserted: 0 },
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function listAspmScanTargets(): Promise<{
  ok: boolean;
  tree?: ScanTargetTree;
  error?: string;
}> {
  try {
    requireFeatureFlag('aspm');
    const useCase = resolve<ListScanTargetsUseCase>('ListScanTargetsUseCase');
    const tree = await useCase.execute();
    return { ok: true, tree };
  } catch (err) {
    if (err instanceof FeatureFlagDisabledError) return { ok: false, error: err.message };
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
