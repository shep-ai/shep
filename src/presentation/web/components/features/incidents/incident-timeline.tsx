'use client';

/**
 * IncidentTimeline — what happened on an incident, oldest first (spec 129):
 * alerts, notes, the evidence triage read, its hypotheses, and every action
 * and whether the workload recovered. Long evidence folds away.
 */

import { useTranslation } from 'react-i18next';
import { IncidentEventKind, type IncidentEvent } from '@shepai/core/domain/generated/output';

const FAILURE_KINDS: readonly IncidentEventKind[] = [
  IncidentEventKind.ActionFailed,
  IncidentEventKind.NotRecovered,
  IncidentEventKind.ActionRejected,
];

export function IncidentTimeline({ events }: { events: IncidentEvent[] }) {
  const { t } = useTranslation('web');
  return (
    <ol aria-label={t('incidents.timeline')} className="space-y-1.5 border-s ps-3 text-xs">
      {events.map((event) => (
        <li key={event.id} data-testid={`incident-event-${event.id}`} className="space-y-0.5">
          <p className="flex flex-wrap items-baseline gap-1.5">
            <span className="text-muted-foreground font-mono text-[11px]">
              {new Date(event.createdAt).toLocaleTimeString()}
            </span>
            <span
              className={
                FAILURE_KINDS.includes(event.kind) ? 'text-destructive font-medium' : 'font-medium'
              }
            >
              {t(`incidents.eventKind.${event.kind}`)}
            </span>
          </p>
          {event.kind === IncidentEventKind.Evidence ? (
            <details>
              <summary className="text-muted-foreground cursor-pointer">
                {t('incidents.showEvidence')}
              </summary>
              <pre className="bg-muted mt-1 overflow-x-auto rounded p-1.5 font-mono text-[11px] whitespace-pre-wrap">
                {event.text}
              </pre>
            </details>
          ) : (
            <p className="whitespace-pre-wrap">{event.text}</p>
          )}
        </li>
      ))}
    </ol>
  );
}
