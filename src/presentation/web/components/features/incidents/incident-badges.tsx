'use client';

/**
 * Severity and status badges for an incident (spec 129): critical and open
 * stand out; resolved fades.
 */

import { useTranslation } from 'react-i18next';
import {
  IncidentSeverity,
  IncidentStatus,
  RuntimeActionStatus,
} from '@shepai/core/domain/generated/output';
import { Badge } from '@/components/ui/badge';

type BadgeVariant = 'destructive' | 'default' | 'secondary' | 'outline';

const SEVERITY_VARIANT: Record<IncidentSeverity, BadgeVariant> = {
  [IncidentSeverity.Critical]: 'destructive',
  [IncidentSeverity.Major]: 'default',
  [IncidentSeverity.Minor]: 'secondary',
};

const STATUS_VARIANT: Record<IncidentStatus, BadgeVariant> = {
  [IncidentStatus.Open]: 'destructive',
  [IncidentStatus.Mitigated]: 'secondary',
  [IncidentStatus.Resolved]: 'outline',
};

const ACTION_STATUS_VARIANT: Record<RuntimeActionStatus, BadgeVariant> = {
  [RuntimeActionStatus.Proposed]: 'default',
  [RuntimeActionStatus.Approved]: 'secondary',
  [RuntimeActionStatus.Rejected]: 'outline',
  [RuntimeActionStatus.Succeeded]: 'secondary',
  [RuntimeActionStatus.Failed]: 'destructive',
};

export function SeverityBadge({ severity }: { severity: IncidentSeverity }) {
  const { t } = useTranslation('web');
  return (
    <Badge variant={SEVERITY_VARIANT[severity]} className="text-[10px]">
      {t(`incidents.severity.${severity}`)}
    </Badge>
  );
}

export function IncidentStatusBadge({ status }: { status: IncidentStatus }) {
  const { t } = useTranslation('web');
  return (
    <Badge variant={STATUS_VARIANT[status]} className="text-[10px]">
      {t(`incidents.status.${status}`)}
    </Badge>
  );
}

export function ActionStatusBadge({ status }: { status: RuntimeActionStatus }) {
  const { t } = useTranslation('web');
  return (
    <Badge variant={ACTION_STATUS_VARIANT[status]} className="text-[10px]">
      {t(`incidents.actionStatus.${status}`)}
    </Badge>
  );
}
