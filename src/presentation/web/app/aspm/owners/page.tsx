/**
 * /aspm/owners — Owner map
 *
 * Feature 098, phase 7 (task-48). Server component that fetches the
 * owner rollups (one row per owner with team + BU + severity counts)
 * via ListOwnerRollupsUseCase and hands them to OwnerMap.
 */

import type {
  ListOwnerRollupsUseCase,
  OwnerRollup,
} from '@shepai/core/application/use-cases/aspm/ownership/list-owner-rollups';
import { resolve } from '@/lib/server-container';

import { OwnerMap } from '@/components/features/aspm/owner-map';

export const dynamic = 'force-dynamic';

export default async function AspmOwnersPage() {
  let owners: OwnerRollup[] = [];
  let error: string | null = null;
  try {
    owners = await resolve<ListOwnerRollupsUseCase>('ListOwnerRollupsUseCase').execute();
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
  }

  return (
    <div className="flex h-full flex-col gap-4 overflow-y-auto p-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Owners</h1>
        <p className="text-muted-foreground text-sm">
          Owners grouped by team and business unit, with their open findings rollup.
        </p>
      </header>
      <OwnerMap owners={owners} error={error} />
    </div>
  );
}
