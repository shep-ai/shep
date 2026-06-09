'use client';

import { Shield, ShieldAlert, ShieldOff } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { SecurityMode } from '@shepai/core/domain/generated/output';

export interface SecurityBadgeProps {
  mode: SecurityMode;
  className?: string;
}

const BADGE_CONFIG: Record<
  SecurityMode,
  { icon: typeof Shield; colorClass: string; labelKey: string }
> = {
  [SecurityMode.Disabled]: {
    icon: ShieldOff,
    colorClass: 'text-gray-400',
    labelKey: 'settings.security.badge.disabled',
  },
  [SecurityMode.Advisory]: {
    icon: Shield,
    colorClass: 'text-yellow-500',
    labelKey: 'settings.security.badge.advisory',
  },
  [SecurityMode.Enforce]: {
    icon: ShieldAlert,
    colorClass: 'text-red-500',
    labelKey: 'settings.security.badge.enforce',
  },
};

export function SecurityBadge({ mode, className }: SecurityBadgeProps) {
  const { t } = useTranslation('web');
  const config = BADGE_CONFIG[mode];
  const Icon = config.icon;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            data-testid="security-badge"
            className={cn('inline-flex shrink-0 items-center', className)}
          >
            <Icon className={cn('h-3.5 w-3.5', config.colorClass)} />
          </span>
        </TooltipTrigger>
        <TooltipContent side="top">
          <p className="text-xs">{t(config.labelKey)}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
