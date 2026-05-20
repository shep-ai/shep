'use server';

/**
 * ASPM ingest server action.
 *
 * Replaces the CLI-only `shep aspm ingest --sarif <file> --application <slug>`
 * flow with a UI-driven equivalent. The web client uploads a SARIF v2.1.0 or
 * CycloneDX 1.5+ document via FormData; this action streams it into the same
 * core use case the CLI calls. Re-uploading the same document is a no-op
 * (the use case is idempotent — dedup keys are enforced at the storage layer).
 *
 * Always gate on the `aspm` feature flag so the action 404s when the module
 * is off, even though the route is reachable by anyone who has the path.
 */

import { revalidatePath } from 'next/cache';
import { resolve } from '@/lib/server-container';
import { requireFeatureFlag, FeatureFlagDisabledError } from '@/lib/feature-flags';
import type {
  IngestFindingsUseCase,
  IngestFindingsResult,
} from '@shepai/core/application/use-cases/aspm/findings/ingest-findings';
import type {
  IngestSbomUseCase,
  IngestSbomResult,
} from '@shepai/core/application/use-cases/aspm/findings/ingest-sbom';
import type { ListApplicationsUseCase } from '@shepai/core/application/use-cases/applications/list-applications.use-case';

export type AspmIngestSource = 'sarif' | 'sbom';

export interface AspmIngestSummary {
  source: AspmIngestSource;
  applicationId: string;
  applicationName: string;
  inputFile: string;
  inserted: number;
  duplicates: number;
  total: number;
  toolName?: string;
  sourceLabel: string;
  documentHash: string;
  durationMs: number;
  componentCount?: number;
  complianceLinksWritten?: number;
}

export interface AspmIngestActionResult {
  ok: boolean;
  summary?: AspmIngestSummary;
  error?: string;
}

const MAX_DOCUMENT_BYTES = 25 * 1024 * 1024; // 25 MB — matches the CLI/adapter default cap.

/**
 * Lightweight option shape consumed by the {@link AspmIngestDialog} application
 * picker. Returns only id + name so the picker stays presentation-agnostic.
 */
export interface AspmIngestApplicationOption {
  id: string;
  name: string;
}

export async function listAspmIngestApplications(): Promise<{
  ok: boolean;
  applications?: AspmIngestApplicationOption[];
  error?: string;
}> {
  try {
    requireFeatureFlag('aspm');
    const useCase = resolve<ListApplicationsUseCase>('ListApplicationsUseCase');
    const apps = await useCase.execute();
    return {
      ok: true,
      applications: apps.map((a) => ({ id: a.id, name: a.name })),
    };
  } catch (err) {
    if (err instanceof FeatureFlagDisabledError) return { ok: false, error: err.message };
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function ingestAspmDocument(formData: FormData): Promise<AspmIngestActionResult> {
  try {
    requireFeatureFlag('aspm');

    const applicationId = readString(formData, 'applicationId');
    const source = readString(formData, 'source') as AspmIngestSource;
    if (source !== 'sarif' && source !== 'sbom') {
      return { ok: false, error: 'Source must be either "sarif" or "sbom"' };
    }

    const file = formData.get('file');
    if (!(file instanceof File) || file.size === 0) {
      return { ok: false, error: 'A SARIF or SBOM file is required' };
    }
    if (file.size > MAX_DOCUMENT_BYTES) {
      return {
        ok: false,
        error: `File is too large (${formatBytes(file.size)}); the limit is ${formatBytes(MAX_DOCUMENT_BYTES)}`,
      };
    }

    const document = await file.text();
    const applicationName = readString(formData, 'applicationName', file.name);

    if (source === 'sarif') {
      const useCase = resolve<IngestFindingsUseCase>('IngestFindingsUseCase');
      const result: IngestFindingsResult = await useCase.execute({
        applicationId,
        sourceType: 'sarif',
        document,
      });
      revalidatePath('/aspm', 'layout');
      return {
        ok: true,
        summary: {
          source,
          applicationId,
          applicationName,
          inputFile: file.name,
          inserted: result.inserted,
          duplicates: result.duplicates,
          total: result.total,
          toolName: result.toolName,
          sourceLabel: result.sourceLabel,
          documentHash: result.documentHash,
          durationMs: result.durationMs,
          complianceLinksWritten: result.complianceLinksWritten,
        },
      };
    }

    const useCase = resolve<IngestSbomUseCase>('IngestSbomUseCase');
    const result: IngestSbomResult = await useCase.execute({ applicationId, document });
    revalidatePath('/aspm', 'layout');
    return {
      ok: true,
      summary: {
        source,
        applicationId,
        applicationName,
        inputFile: file.name,
        inserted: result.inserted,
        duplicates: result.duplicates,
        total: result.total,
        toolName: result.toolName,
        sourceLabel: result.sourceLabel,
        documentHash: result.documentHash,
        durationMs: result.durationMs,
        componentCount: result.componentCount,
      },
    };
  } catch (err) {
    if (err instanceof FeatureFlagDisabledError) return { ok: false, error: err.message };
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

function readString(formData: FormData, name: string, fallback?: string): string {
  const raw = formData.get(name);
  if (typeof raw === 'string' && raw.trim().length > 0) return raw.trim();
  if (fallback !== undefined) return fallback;
  throw new Error(`Missing form field: ${name}`);
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
