'use client';

/**
 * TrackerRuleRow — one sync rule: what it reads and where it writes, its mode
 * and interval, what its last run did (or why it failed), and pause, run-now
 * and remove controls.
 */

import { useTranslation } from 'react-i18next';
import { Pause, Play, RefreshCw, Trash2 } from 'lucide-react';
import type { TrackerSyncRuleView } from '@shepai/core/application/use-cases/trackers/manage-tracker-sync-rules.use-case';
import { TrackerSyncDirection } from '@shepai/core/domain/generated/output';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  removeTrackerSyncRule,
  runTrackerSync,
  setTrackerSyncRuleEnabled,
} from '@/app/actions/manage-trackers';
import type { RunTrackerAction } from './trackers-types';

export interface TrackerRuleRowProps {
  view: TrackerSyncRuleView;
  run: RunTrackerAction;
}

export function TrackerRuleRow({ view, run }: TrackerRuleRowProps) {
  const { t } = useTranslation('web');
  const { rule, project } = view;
  const lastRun = rule.lastRun;

  return (
    <li className="flex flex-wrap items-center gap-2 rounded-md border px-2 py-1.5 text-xs">
      <code className="min-w-0 truncate">{rule.scope}</code>
      <span className="text-muted-foreground">→ {project.name}</span>
      <Badge variant="outline" className="text-[10px]">
        {rule.direction === TrackerSyncDirection.TwoWay
          ? t('trackers.rules.twoWay')
          : t('trackers.rules.import')}
      </Badge>
      <span className="text-muted-foreground">
        {t('trackers.rules.everyShort', { minutes: rule.intervalMinutes })}
      </span>
      {rule.enabled ? null : (
        <Badge variant="secondary" className="text-[10px]">
          {t('trackers.rules.paused')}
        </Badge>
      )}
      <span className="min-w-0 flex-1 truncate" data-testid={`tracker-rule-last-run-${rule.id}`}>
        {rule.lastError ? (
          <span className="text-destructive">{rule.lastError}</span>
        ) : lastRun ? (
          <span className="text-muted-foreground">{t('trackers.rules.summary', lastRun)}</span>
        ) : (
          <span className="text-muted-foreground">{t('trackers.rules.never')}</span>
        )}
      </span>
      <div className="flex gap-0.5">
        <Button
          variant="ghost"
          size="icon-xs"
          title={t(rule.enabled ? 'trackers.rules.pause' : 'trackers.rules.resume')}
          aria-label={t(rule.enabled ? 'trackers.rules.pause' : 'trackers.rules.resume')}
          onClick={() => run(() => setTrackerSyncRuleEnabled(rule.id, !rule.enabled))}
          data-testid={`tracker-rule-toggle-${rule.id}`}
        >
          {rule.enabled ? <Pause /> : <Play />}
        </Button>
        <Button
          variant="ghost"
          size="icon-xs"
          title={t('trackers.rules.runNow')}
          aria-label={t('trackers.rules.runNow')}
          onClick={() => run(() => runTrackerSync(rule.id))}
          data-testid={`tracker-rule-run-${rule.id}`}
        >
          <RefreshCw />
        </Button>
        <Button
          variant="ghost"
          size="icon-xs"
          title={t('trackers.rules.remove')}
          aria-label={t('trackers.rules.remove')}
          onClick={() => run(() => removeTrackerSyncRule(rule.id))}
          data-testid={`tracker-rule-remove-${rule.id}`}
        >
          <Trash2 />
        </Button>
      </div>
    </li>
  );
}
