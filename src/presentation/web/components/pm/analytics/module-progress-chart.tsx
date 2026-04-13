'use client';

import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';

export interface ModuleProgressItem {
  moduleId: string;
  moduleName: string;
  moduleStatus: string;
  totalItems: number;
  completedItems: number;
  progressPercent: number;
}

export interface ModuleProgressChartProps {
  modules: ModuleProgressItem[];
  className?: string;
}

export function ModuleProgressChart({ modules, className }: ModuleProgressChartProps) {
  if (modules.length === 0) {
    return (
      <div
        data-testid="module-progress-empty"
        className="text-muted-foreground flex flex-col items-center justify-center py-12 text-center"
      >
        <p className="text-xs">No modules to display. Create a module to track progress.</p>
      </div>
    );
  }

  return (
    <div data-testid="module-progress-chart" className={className}>
      <h3 className="mb-3 text-xs font-medium">Module Progress</h3>
      <ResponsiveContainer width="100%" height={Math.max(180, modules.length * 40 + 40)}>
        <BarChart data={modules} layout="vertical" margin={{ left: 80, right: 40 }}>
          <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 10 }} unit="%" />
          <YAxis type="category" dataKey="moduleName" tick={{ fontSize: 10 }} width={75} />
          <Tooltip
            formatter={(value) => [`${value}%`, 'Progress']}
            contentStyle={{
              fontSize: 11,
              borderRadius: 8,
              border: '1px solid hsl(var(--border))',
            }}
          />
          <Bar dataKey="progressPercent" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
        </BarChart>
      </ResponsiveContainer>
      <div className="mt-3 space-y-1">
        {modules.map((mod) => (
          <div key={mod.moduleId} className="flex items-center justify-between text-[10px]">
            <span className="text-muted-foreground">{mod.moduleName}</span>
            <span>
              {mod.completedItems}/{mod.totalItems} items · {mod.progressPercent}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
