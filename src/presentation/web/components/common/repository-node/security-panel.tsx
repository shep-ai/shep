'use client';

import { useState } from 'react';
import { Shield, ChevronDown, AlertTriangle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import type { SecurityEvent } from '@shepai/core/domain/generated/output';

export interface SecurityPanelProps {
  events: SecurityEvent[];
}

const SEVERITY_COLORS: Record<string, string> = {
  Low: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  Medium: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300',
  High: 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300',
  Critical: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
};

const SEVERITY_ICON_COLORS: Record<string, string> = {
  Low: 'text-blue-500',
  Medium: 'text-yellow-500',
  High: 'text-orange-500',
  Critical: 'text-red-500',
};

export function SecurityPanel({ events }: SecurityPanelProps) {
  const { t } = useTranslation('web');
  const hasFindings = events.length > 0;
  const [expanded, setExpanded] = useState(hasFindings);

  const severityCounts = events.reduce(
    (acc, event) => {
      acc[event.severity] = (acc[event.severity] ?? 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );

  return (
    <div data-testid="security-panel">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex w-full cursor-pointer items-center justify-between text-left"
      >
        <div className="flex items-center gap-2">
          <Shield className="text-muted-foreground h-3.5 w-3.5" />
          <span className="text-muted-foreground text-xs font-semibold tracking-wider">
            {t('settings.security.panel.title').toUpperCase()}
          </span>
          {hasFindings ? (
            <Badge
              variant="secondary"
              className="bg-red-100 px-1.5 py-0 text-[9px] text-red-700 dark:bg-red-900/40 dark:text-red-300"
            >
              {events.length}
            </Badge>
          ) : null}
        </div>
        <ChevronDown
          className={cn(
            'text-muted-foreground h-3.5 w-3.5 transition-transform',
            expanded && 'rotate-180'
          )}
        />
      </button>

      {expanded ? (
        <div className="mt-3 flex flex-col gap-2">
          {!hasFindings ? (
            <p className="text-muted-foreground text-xs">
              {t('settings.security.panel.noFindings')}
            </p>
          ) : (
            <>
              {/* Severity summary */}
              <div className="flex flex-wrap gap-1.5">
                {Object.entries(severityCounts).map(([severity, count]) => (
                  <Badge
                    key={severity}
                    variant="secondary"
                    className={cn('px-1.5 py-0 text-[9px]', SEVERITY_COLORS[severity])}
                  >
                    {count} {severity}
                  </Badge>
                ))}
              </div>

              {/* Event list */}
              <div className="flex flex-col gap-1.5">
                {events.slice(0, 5).map((event) => (
                  <div
                    key={event.id}
                    className="flex items-start gap-2 rounded-md border px-2 py-1.5"
                  >
                    <AlertTriangle
                      className={cn(
                        'mt-0.5 h-3 w-3 shrink-0',
                        SEVERITY_ICON_COLORS[event.severity] ?? 'text-muted-foreground'
                      )}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[11px]">{event.message}</p>
                      {event.remediationSummary ? (
                        <p className="text-muted-foreground mt-0.5 truncate text-[10px]">
                          {event.remediationSummary}
                        </p>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}
