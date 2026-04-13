'use client';

import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';

export interface StateBreakdownItem {
  stateId: string;
  stateName: string;
  stateGroup: string;
  stateColor: string;
  count: number;
}

export interface PriorityBreakdownItem {
  priority: string;
  count: number;
}

export interface StatusBreakdownProps {
  byState: StateBreakdownItem[];
  byPriority: PriorityBreakdownItem[];
  totalItems: number;
  className?: string;
}

const PRIORITY_COLORS: Record<string, string> = {
  Urgent: '#ef4444',
  High: '#f97316',
  Medium: '#eab308',
  Low: '#3b82f6',
  None: '#a3a3a3',
};

export function StatusBreakdown({
  byState,
  byPriority,
  totalItems,
  className,
}: StatusBreakdownProps) {
  if (totalItems === 0) {
    return (
      <div
        data-testid="status-breakdown-empty"
        className="text-muted-foreground flex flex-col items-center justify-center py-12 text-center"
      >
        <p className="text-xs">No work items to break down.</p>
      </div>
    );
  }

  const stateData = byState.filter((s) => s.count > 0);
  const priorityData = byPriority.filter((p) => p.count > 0);

  return (
    <div data-testid="status-breakdown" className={className}>
      <div className="grid gap-6 md:grid-cols-2">
        <div>
          <h3 className="mb-3 text-xs font-medium">By State</h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={stateData} layout="vertical" margin={{ left: 60, right: 20 }}>
              <XAxis type="number" tick={{ fontSize: 10 }} />
              <YAxis type="category" dataKey="stateName" tick={{ fontSize: 10 }} width={55} />
              <Tooltip
                contentStyle={{
                  fontSize: 11,
                  borderRadius: 8,
                  border: '1px solid hsl(var(--border))',
                }}
              />
              <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                {stateData.map((entry) => (
                  <Cell key={entry.stateId} fill={entry.stateColor} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div>
          <h3 className="mb-3 text-xs font-medium">By Priority</h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={priorityData} layout="vertical" margin={{ left: 50, right: 20 }}>
              <XAxis type="number" tick={{ fontSize: 10 }} />
              <YAxis type="category" dataKey="priority" tick={{ fontSize: 10 }} width={45} />
              <Tooltip
                contentStyle={{
                  fontSize: 11,
                  borderRadius: 8,
                  border: '1px solid hsl(var(--border))',
                }}
              />
              <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                {priorityData.map((entry) => (
                  <Cell key={entry.priority} fill={PRIORITY_COLORS[entry.priority] ?? '#a3a3a3'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
