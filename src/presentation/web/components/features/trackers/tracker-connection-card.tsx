'use client';

/**
 * TrackerConnectionCard — one Linear or Jira connection: account, space and
 * health, its sync rules, and test / remove controls. Removing a connection
 * removes its rules but keeps every work item it synced.
 */

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PlugZap, Trash2 } from 'lucide-react';
import type { ConnectionOverview } from '@shepai/core/application/use-cases/trackers/get-tracker-overview.use-case';
import { ConnectionStatus } from '@shepai/core/domain/generated/output';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { removeConnection, testConnection } from '@/app/actions/manage-trackers';
import { AddSyncRuleForm } from './add-sync-rule-form';
import { TrackerRuleRow } from './tracker-rule-row';
import type { RunTrackerAction } from './trackers-types';

export interface TrackerConnectionCardProps {
  overview: ConnectionOverview;
  projects: { id: string; name: string }[];
  run: RunTrackerAction;
}

export function TrackerConnectionCard({ overview, projects, run }: TrackerConnectionCardProps) {
  const { t } = useTranslation('web');
  const { connection, spaceName, rules } = overview;
  const [confirmRemove, setConfirmRemove] = useState(false);
  const healthy = connection.status === ConnectionStatus.Connected;

  return (
    <article
      data-testid={`tracker-connection-${connection.slug}`}
      className="bg-card space-y-3 rounded-lg border p-4"
    >
      <header className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h2 className="truncate text-sm font-semibold">{connection.name}</h2>
            <Badge variant="outline" className="text-[10px]">
              {connection.provider}
            </Badge>
            <Badge variant={healthy ? 'secondary' : 'destructive'} className="text-[10px]">
              {t(healthy ? 'trackers.connection.connected' : 'trackers.connection.error')}
            </Badge>
          </div>
          <p className="text-muted-foreground mt-0.5 text-xs">
            {[
              connection.accountName
                ? t('trackers.connection.account', { account: connection.accountName })
                : null,
              connection.siteUrl ?? null,
            ]
              .filter(Boolean)
              .map((part) => `${part} · `)
              .join('')}
            <span data-testid="tracker-connection-space">
              {t('trackers.connection.space', { space: spaceName })}
            </span>
          </p>
          {connection.lastError ? (
            <p className="text-destructive mt-1 text-xs">{connection.lastError}</p>
          ) : null}
        </div>
        <div className="flex shrink-0 gap-1">
          <Button
            variant="ghost"
            size="xs"
            onClick={() => run(() => testConnection(connection.id))}
            data-testid="tracker-connection-test"
          >
            <PlugZap />
            {t('trackers.connection.test')}
          </Button>
          <Button
            variant="ghost"
            size="icon-xs"
            title={t('trackers.connection.remove')}
            aria-label={t('trackers.connection.remove')}
            onClick={() => setConfirmRemove(true)}
            data-testid="tracker-connection-remove"
          >
            <Trash2 />
          </Button>
        </div>
      </header>

      <section className="space-y-2">
        <h3 className="text-muted-foreground text-[11px] font-medium tracking-wide uppercase">
          {t('trackers.rules.title')}
        </h3>
        {rules.length === 0 ? (
          <p className="text-muted-foreground text-xs">{t('trackers.rules.empty')}</p>
        ) : (
          <ul className="space-y-1">
            {rules.map((view) => (
              <TrackerRuleRow key={view.rule.id} view={view} run={run} />
            ))}
          </ul>
        )}
        <AddSyncRuleForm
          connectionId={connection.id}
          provider={connection.provider}
          projects={projects}
          run={run}
        />
      </section>

      <AlertDialog open={confirmRemove} onOpenChange={setConfirmRemove}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t('trackers.connection.removeTitle', { name: connection.name })}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t('trackers.connection.removeDescription')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('trackers.connection.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => run(() => removeConnection(connection.id))}
              data-testid="tracker-connection-remove-confirm"
            >
              {t('trackers.connection.remove')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </article>
  );
}
