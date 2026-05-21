/**
 * /aspm/findings — Findings list page
 *
 * Feature 098, phase 7 (task-44). Server component that fetches the
 * top-ranked findings via the rank-findings use case (composite risk
 * score descending) and renders them with the existing FindingsTable +
 * FindingsFilterBar components from phase 3.
 *
 * Filter state lives in the URL query string so the page is fully SSR-
 * friendly and shareable. Mutations are handled by the client filter
 * bar emitting a navigation, not a client-side fetch.
 */

import type {
  RankFindingsUseCase,
  RankFindingsResult,
} from '@shepai/core/application/use-cases/aspm/findings/rank-findings';
import type { ListApplicationsUseCase } from '@shepai/core/application/use-cases/applications/list-applications.use-case';
import {
  CanonicalSeverity,
  FindingDomain,
  FindingState,
  type FindingFilter,
} from '@shepai/core/domain/generated/output';
import { resolve } from '@/lib/server-container';
import { FindingsPageClient } from '@/components/features/aspm/findings-page-client';
import type { ApplicationSummary } from '@/components/features/aspm/findings-table';

export const dynamic = 'force-dynamic';

interface RouteProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function FindingsRoute({ searchParams }: RouteProps) {
  const params = await searchParams;
  const filter = parseFilter(params);

  let result: RankFindingsResult | null = null;
  let applications: ApplicationSummary[] = [];
  let error: string | null = null;
  try {
    [result, applications] = await Promise.all([
      resolve<RankFindingsUseCase>('RankFindingsUseCase').execute({ filter }),
      loadApplications(),
    ]);
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
  }

  return (
    <div className="flex h-full flex-col gap-3 overflow-y-auto p-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Findings</h1>
        <p className="text-muted-foreground text-sm">
          Ranked by composite risk score (CVSS × EPSS × KEV × exposure × criticality).
        </p>
      </header>

      <FindingsPageClient
        initialFilter={filter}
        findings={result ? result.items.map((r) => r.finding) : []}
        applications={applications}
        total={result ? result.total : 0}
        error={error}
      />
    </div>
  );
}

async function loadApplications(): Promise<ApplicationSummary[]> {
  try {
    const apps = await resolve<ListApplicationsUseCase>('ListApplicationsUseCase').execute();
    return apps.map((a) => ({ id: a.id, name: a.name, slug: a.slug }));
  } catch {
    // Findings still render without app names; only the column degrades.
    return [];
  }
}

function parseFilter(params: Record<string, string | string[] | undefined>): FindingFilter {
  return {
    severities: parseEnumList(params.severity, Object.values(CanonicalSeverity)),
    findingDomains: parseEnumList(params.domain, Object.values(FindingDomain)),
    states: parseEnumList(params.state, Object.values(FindingState)),
    kev: params.kev === 'true' ? true : params.kev === 'false' ? false : undefined,
    ownerIds: parseStringList(params.owner),
    ruleIds: parseStringList(params.rule),
    applicationIds: parseStringList(params.app),
    cveIds: parseStringList(params.cve),
  };
}

function parseEnumList<T extends string>(
  raw: string | string[] | undefined,
  allowed: readonly T[]
): T[] | undefined {
  const values = parseStringList(raw);
  if (!values) return undefined;
  const allowedSet = new Set(allowed);
  const filtered = values.filter((v): v is T => allowedSet.has(v as T));
  return filtered.length === 0 ? undefined : filtered;
}

function parseStringList(raw: string | string[] | undefined): string[] | undefined {
  if (raw === undefined) return undefined;
  if (Array.isArray(raw)) return raw.flatMap((v) => v.split(',')).filter(Boolean);
  const trimmed = raw.split(',').filter(Boolean);
  return trimmed.length === 0 ? undefined : trimmed;
}
