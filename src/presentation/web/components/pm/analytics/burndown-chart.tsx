'use client';

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';

export interface BurndownDataPoint {
  date: string;
  ideal: number;
  actual: number;
}

export interface BurndownChartProps {
  dataPoints: BurndownDataPoint[];
  cycleName: string;
  totalItems: number;
  completedItems: number;
  className?: string;
}

export function BurndownChart({
  dataPoints,
  cycleName,
  totalItems,
  completedItems,
  className,
}: BurndownChartProps) {
  if (dataPoints.length === 0) {
    return (
      <div
        data-testid="burndown-chart-empty"
        className="text-muted-foreground flex flex-col items-center justify-center py-12 text-center"
      >
        <p className="text-xs">No burndown data available. Set start and end dates on the cycle.</p>
      </div>
    );
  }

  return (
    <div data-testid="burndown-chart" className={className}>
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-xs font-medium">{cycleName} — Burndown</h3>
        <span className="text-muted-foreground text-[10px]">
          {completedItems}/{totalItems} completed
        </span>
      </div>
      <ResponsiveContainer width="100%" height={280}>
        <LineChart data={dataPoints} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
          <XAxis
            dataKey="date"
            tick={{ fontSize: 10 }}
            tickFormatter={(v: string) => v.slice(5)}
            className="fill-muted-foreground"
          />
          <YAxis tick={{ fontSize: 10 }} className="fill-muted-foreground" />
          <Tooltip
            contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid hsl(var(--border))' }}
          />
          <Legend iconSize={8} wrapperStyle={{ fontSize: 11 }} />
          <Line
            type="monotone"
            dataKey="ideal"
            stroke="hsl(var(--muted-foreground))"
            strokeDasharray="5 5"
            dot={false}
            name="Ideal"
          />
          <Line
            type="monotone"
            dataKey="actual"
            stroke="hsl(var(--primary))"
            strokeWidth={2}
            dot={{ r: 2 }}
            name="Actual"
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
