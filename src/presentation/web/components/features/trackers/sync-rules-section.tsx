'use client';

/**
 * SyncRulesSection — a tracker connection's sync rules and the form to add
 * one (spec 122).
 */

import { useTranslation } from 'react-i18next';
import type { TrackerSyncRuleView } from '@shepai/core/application/use-cases/trackers/manage-tracker-sync-rules.use-case';
import type { ConnectionProvider } from '@shepai/core/domain/generated/output';
import { AddSyncRuleForm } from './add-sync-rule-form';
import { TrackerRuleRow } from './tracker-rule-row';
import type { RunTrackerAction } from './trackers-types';

export interface SyncRulesSectionProps {
  connectionId: string;
  provider: ConnectionProvider;
  rules: TrackerSyncRuleView[];
  projects: { id: string; name: string }[];
  run: RunTrackerAction;
}

export function SyncRulesSection({
  connectionId,
  provider,
  rules,
  projects,
  run,
}: SyncRulesSectionProps) {
  const { t } = useTranslation('web');
  return (
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
        connectionId={connectionId}
        provider={provider}
        projects={projects}
        run={run}
      />
    </section>
  );
}
