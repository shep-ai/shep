'use client';

import Link from 'next/link';
import type { Route } from 'next';
import { ArrowRight, ExternalLink } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import type { ActivityNextStep } from './activity-next-step';

export interface ActivityNextStepLinkProps {
  step: ActivityNextStep;
  className?: string;
}

/** The link to the screen that moves a feature along (spec 148). */
export function ActivityNextStepLink({ step, className }: ActivityNextStepLinkProps) {
  const { t } = useTranslation('web');
  const label = t(`agentActivity.next.${step.labelKey}`);
  const classes = cn(
    'text-primary inline-flex items-center gap-1 text-xs font-medium hover:underline',
    className
  );
  if (step.external) {
    return (
      <a
        href={step.href}
        target="_blank"
        rel="noopener noreferrer"
        className={classes}
        data-testid="activity-next-step-link"
      >
        {label}
        <ExternalLink aria-hidden className="size-3" />
      </a>
    );
  }
  return (
    <Link href={step.href as Route} className={classes} data-testid="activity-next-step-link">
      {label}
      <ArrowRight aria-hidden className="size-3" />
    </Link>
  );
}
