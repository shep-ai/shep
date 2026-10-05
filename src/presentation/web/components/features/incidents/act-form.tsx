'use client';

/**
 * ActForm — run a restart, rollback or scale on the incident's workload
 * yourself (spec 129). An action a person asks for runs at once and is then
 * checked for recovery.
 */

import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Play } from 'lucide-react';
import { RuntimeActionKind } from '@shepai/core/domain/generated/output';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NATIVE_SELECT_CLASS } from '@/lib/native-select-class';
import type { RunAction } from '@/hooks/use-run-action';
import { actOnIncident } from '@/app/actions/incidents';

export interface ActFormProps {
  incidentId: string;
  run: RunAction;
}

export function ActForm({ incidentId, run }: ActFormProps) {
  const { t } = useTranslation('web');
  const [kind, setKind] = useState<RuntimeActionKind>(RuntimeActionKind.Restart);
  const [replicas, setReplicas] = useState('');
  const [reason, setReason] = useState('');
  const [acting, setActing] = useState(false);
  const scaling = kind === RuntimeActionKind.Scale;

  async function submit(event: FormEvent) {
    event.preventDefault();
    setActing(true);
    try {
      const done = await run(() =>
        actOnIncident(incidentId, kind, reason, scaling ? Number(replicas) : undefined)
      );
      if (done) setReason('');
    } finally {
      setActing(false);
    }
  }

  return (
    <form
      onSubmit={submit}
      aria-label={t('incidents.act.title')}
      className="flex flex-wrap items-center gap-1.5"
    >
      <select
        value={kind}
        onChange={(e) => setKind(e.target.value as RuntimeActionKind)}
        aria-label={t('incidents.act.kind')}
        className={`${NATIVE_SELECT_CLASS} h-7`}
        data-testid="act-kind"
      >
        {Object.values(RuntimeActionKind).map((option) => (
          <option key={option} value={option}>
            {t(`incidents.actionKind.${option}`)}
          </option>
        ))}
      </select>
      {scaling ? (
        <Input
          type="number"
          min={0}
          value={replicas}
          onChange={(e) => setReplicas(e.target.value)}
          placeholder={t('incidents.act.replicas')}
          aria-label={t('incidents.act.replicas')}
          className="h-7 w-24 text-xs"
          data-testid="act-replicas"
        />
      ) : null}
      <Input
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder={t('incidents.act.reason')}
        aria-label={t('incidents.act.reason')}
        className="h-7 min-w-40 flex-1 text-xs"
        data-testid="act-reason"
      />
      <Button
        type="submit"
        size="xs"
        variant="outline"
        disabled={acting || (scaling && replicas.trim() === '')}
        data-testid="act-submit"
      >
        <Play className={acting ? 'animate-pulse' : undefined} />
        {t(acting ? 'incidents.act.running' : 'incidents.act.submit')}
      </Button>
    </form>
  );
}
