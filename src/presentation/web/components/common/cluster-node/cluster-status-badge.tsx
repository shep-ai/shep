'use client';

import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import type { ClusterStatus } from '@shepai/core/domain/generated/output';
import { clusterStatusStyles } from './cluster-node-config';

interface ClusterStatusBadgeProps {
  status: ClusterStatus;
  className?: string;
}

/**
 * Renders a status badge with a colored dot and translated label.
 * Uses both color and text for accessibility (NFR-11).
 * Provisioning, Stopping, and Destroying states have a pulse animation.
 */
export function ClusterStatusBadge({ status, className }: ClusterStatusBadgeProps) {
  const { t } = useTranslation('web');
  const style = clusterStatusStyles[status];

  return (
    <span
      data-testid="cluster-status-badge"
      className={cn('flex shrink-0 items-center gap-1.5', className)}
    >
      <span
        data-testid="cluster-status-dot"
        className={cn(
          'relative flex h-2 w-2 items-center justify-center rounded-full',
          style.dotClass
        )}
      >
        {style.pulse ? (
          <span
            className={cn(
              'absolute inline-flex h-full w-full animate-ping rounded-full opacity-60',
              style.dotClass
            )}
          />
        ) : null}
      </span>
      <span data-testid="cluster-status-text" className={cn('text-xs', style.textClass)}>
        {t(style.labelKey)}
      </span>
    </span>
  );
}
