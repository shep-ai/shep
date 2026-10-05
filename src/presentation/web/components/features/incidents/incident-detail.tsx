'use client';

/**
 * IncidentDetail — one incident (spec 129): what is wrong and where, triage
 * by the space's agent, the runtime actions proposed or taken, the timeline,
 * and resolving it with a postmortem. A resolved incident shows its
 * postmortem and takes no more actions.
 */

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ExternalLink, Stethoscope } from 'lucide-react';
import { IncidentStatus } from '@shepai/core/domain/generated/output';
import type { IncidentDetail as Detail } from '@shepai/core/application/use-cases/incidents/manage-incidents.use-case';
import { Button } from '@/components/ui/button';
import type { RunAction } from '@/hooks/use-run-action';
import { triageIncident } from '@/app/actions/incidents';
import { IncidentStatusBadge, SeverityBadge } from './incident-badges';
import { IncidentTimeline } from './incident-timeline';
import { RuntimeActionRow } from './runtime-action-row';
import { ActForm } from './act-form';
import { NoteForm } from './note-form';
import { ResolveForm } from './resolve-form';

export interface IncidentDetailProps {
  detail: Detail;
  run: RunAction;
}

export function IncidentDetail({ detail, run }: IncidentDetailProps) {
  const { t } = useTranslation('web');
  const [triaging, setTriaging] = useState(false);
  const { incident, events, actions } = detail;
  const resolved = incident.status === IncidentStatus.Resolved;

  async function triage() {
    setTriaging(true);
    try {
      await run(() => triageIncident(incident.id));
    } finally {
      setTriaging(false);
    }
  }

  return (
    <article data-testid="incident-detail" className="bg-card space-y-3 rounded-lg border p-3">
      <header className="space-y-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <h2 className="text-sm font-semibold">{incident.title}</h2>
          <SeverityBadge severity={incident.severity} />
          <IncidentStatusBadge status={incident.status} />
          {incident.url ? (
            <a
              href={incident.url}
              target="_blank"
              rel="noreferrer"
              className="text-muted-foreground hover:text-foreground"
              aria-label={t('incidents.openLink')}
            >
              <ExternalLink className="size-3.5" />
            </a>
          ) : null}
        </div>
        <p className="text-muted-foreground font-mono text-[11px]">
          {incident.runtimeWorkload
            ? t('incidents.workload', {
                workload: incident.runtimeWorkload,
                namespace: incident.runtimeNamespace ?? '',
                context: incident.runtimeContext ?? t('incidents.currentContext'),
              })
            : t('incidents.noWorkload')}
        </p>
        {incident.detail ? <p className="text-xs whitespace-pre-wrap">{incident.detail}</p> : null}
      </header>

      {resolved ? null : (
        <section className="space-y-2">
          <Button
            size="xs"
            variant="outline"
            disabled={triaging}
            onClick={triage}
            data-testid="incident-triage"
          >
            <Stethoscope className={triaging ? 'animate-pulse' : undefined} />
            {t(triaging ? 'incidents.triaging' : 'incidents.triage')}
          </Button>
          {incident.runtimeWorkload ? <ActForm incidentId={incident.id} run={run} /> : null}
        </section>
      )}

      {actions.length > 0 ? (
        <section className="space-y-1">
          <h3 className="text-xs font-medium">{t('incidents.actions')}</h3>
          <ul className="space-y-1">
            {actions.map((action) => (
              <RuntimeActionRow key={action.id} action={action} run={run} />
            ))}
          </ul>
        </section>
      ) : null}

      <section className="space-y-1.5">
        <h3 className="text-xs font-medium">{t('incidents.timeline')}</h3>
        <IncidentTimeline events={events} />
        {resolved ? null : <NoteForm incidentId={incident.id} run={run} />}
      </section>

      <section className="space-y-1">
        <h3 className="text-xs font-medium">{t('incidents.resolve.postmortem')}</h3>
        {incident.postmortem ? (
          <pre
            data-testid="incident-postmortem-text"
            className="bg-muted overflow-x-auto rounded p-2 font-mono text-[11px] whitespace-pre-wrap"
          >
            {incident.postmortem}
          </pre>
        ) : (
          <ResolveForm incidentId={incident.id} run={run} />
        )}
      </section>
    </article>
  );
}
