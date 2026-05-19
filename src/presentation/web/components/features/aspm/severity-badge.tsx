/**
 * SeverityBadge — small colored chip that renders a canonical severity
 * value (feature 098, phase 3 / FR-9 / NFR-16).
 *
 * Colors are chosen to meet WCAG 2.1 AA contrast on both light and dark
 * backgrounds. The label text is also passed as an `aria-label` so screen
 * readers don't have to interpret the color cue.
 */

import { cn } from '@/lib/utils';
import { CanonicalSeverity } from '@shepai/core/domain/generated/output';

const SEVERITY_STYLES: Record<CanonicalSeverity, string> = {
  [CanonicalSeverity.Critical]:
    'bg-red-100 text-red-900 border-red-300 dark:bg-red-950 dark:text-red-100 dark:border-red-800',
  [CanonicalSeverity.High]:
    'bg-orange-100 text-orange-900 border-orange-300 dark:bg-orange-950 dark:text-orange-100 dark:border-orange-800',
  [CanonicalSeverity.Medium]:
    'bg-amber-100 text-amber-900 border-amber-300 dark:bg-amber-950 dark:text-amber-100 dark:border-amber-800',
  [CanonicalSeverity.Low]:
    'bg-sky-100 text-sky-900 border-sky-300 dark:bg-sky-950 dark:text-sky-100 dark:border-sky-800',
  [CanonicalSeverity.Info]:
    'bg-neutral-100 text-neutral-900 border-neutral-300 dark:bg-neutral-800 dark:text-neutral-100 dark:border-neutral-700',
};

const SEVERITY_LABEL: Record<CanonicalSeverity, string> = {
  [CanonicalSeverity.Critical]: 'Critical',
  [CanonicalSeverity.High]: 'High',
  [CanonicalSeverity.Medium]: 'Medium',
  [CanonicalSeverity.Low]: 'Low',
  [CanonicalSeverity.Info]: 'Info',
};

export interface SeverityBadgeProps {
  severity: CanonicalSeverity;
  className?: string;
}

export function SeverityBadge({ severity, className }: SeverityBadgeProps) {
  const label = SEVERITY_LABEL[severity];
  return (
    <span
      data-testid={`severity-badge-${severity.toLowerCase()}`}
      aria-label={`Severity: ${label}`}
      className={cn(
        'inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-semibold tracking-wide uppercase',
        SEVERITY_STYLES[severity],
        className
      )}
    >
      {label}
    </span>
  );
}
