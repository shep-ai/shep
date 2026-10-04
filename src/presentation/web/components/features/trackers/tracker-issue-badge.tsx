'use client';

/**
 * TrackerIssueBadge — the Linear or Jira key of a synced work item, linking to
 * the issue in the tracker (spec 122).
 */

import { useTranslation } from 'react-i18next';
import { ExternalLink } from 'lucide-react';
import { badgeVariants } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

export interface TrackerIssueBadgeProps {
  issueKey: string;
  url: string;
}

export function TrackerIssueBadge({ issueKey, url }: TrackerIssueBadgeProps) {
  const { t } = useTranslation('web');
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      title={t('trackers.badge.open', { key: issueKey })}
      className={cn(badgeVariants({ variant: 'outline' }), 'gap-1 text-[10px] hover:underline')}
      data-testid="tracker-issue-badge"
    >
      {issueKey}
      <ExternalLink className="size-2.5" />
    </a>
  );
}
