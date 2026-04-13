'use client';

import { useEffect, useState } from 'react';
import { BurndownChart } from './burndown-chart';
import type { BurndownDataPoint } from './burndown-chart';
import { StatusBreakdown } from './status-breakdown';
import type { StateBreakdownItem, PriorityBreakdownItem } from './status-breakdown';
import { ModuleProgressChart } from './module-progress-chart';
import type { ModuleProgressItem } from './module-progress-chart';
import { getProjectBreakdown } from '@/app/actions/get-project-breakdown';
import { getCycleBurndown } from '@/app/actions/get-cycle-burndown';
import { getModuleProgress } from '@/app/actions/get-module-progress';
import type { Cycle } from '@shepai/core/domain/generated/output';

export interface AnalyticsDashboardProps {
  projectId: string;
  cycles: Cycle[];
  className?: string;
}

interface BreakdownData {
  totalItems: number;
  byState: StateBreakdownItem[];
  byPriority: PriorityBreakdownItem[];
}

interface BurndownData {
  cycleName: string;
  totalItems: number;
  completedItems: number;
  dataPoints: BurndownDataPoint[];
}

export function AnalyticsDashboard({ projectId, cycles, className }: AnalyticsDashboardProps) {
  const [breakdown, setBreakdown] = useState<BreakdownData | null>(null);
  const [burndown, setBurndown] = useState<BurndownData | null>(null);
  const [modules, setModules] = useState<ModuleProgressItem[]>([]);
  const [loading, setLoading] = useState(true);

  const activeCycle = cycles.find((c) => c.status === 'Active');

  useEffect(() => {
    async function load() {
      setLoading(true);
      const [breakdownResult, moduleResult, burndownResult] = await Promise.all([
        getProjectBreakdown(projectId),
        getModuleProgress(projectId),
        activeCycle ? getCycleBurndown(activeCycle.id) : Promise.resolve(null),
      ]);

      if (breakdownResult?.data) {
        setBreakdown({
          totalItems: breakdownResult.data.totalItems,
          byState: breakdownResult.data.byState,
          byPriority: breakdownResult.data.byPriority,
        });
      }

      if (moduleResult?.modules) {
        setModules(moduleResult.modules);
      }

      if (burndownResult?.data) {
        setBurndown({
          cycleName: burndownResult.data.cycleName,
          totalItems: burndownResult.data.totalItems,
          completedItems: burndownResult.data.completedItems,
          dataPoints: burndownResult.data.dataPoints,
        });
      }

      setLoading(false);
    }
    load();
  }, [projectId, activeCycle]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <span className="text-muted-foreground text-xs">Loading analytics...</span>
      </div>
    );
  }

  return (
    <div data-testid="analytics-dashboard" className={className}>
      <div className="space-y-6">
        {breakdown ? (
          <StatusBreakdown
            byState={breakdown.byState}
            byPriority={breakdown.byPriority}
            totalItems={breakdown.totalItems}
          />
        ) : null}

        {burndown ? (
          <BurndownChart
            dataPoints={burndown.dataPoints}
            cycleName={burndown.cycleName}
            totalItems={burndown.totalItems}
            completedItems={burndown.completedItems}
          />
        ) : null}

        <ModuleProgressChart modules={modules} />
      </div>
    </div>
  );
}
