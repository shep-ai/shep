'use client';

/**
 * ResolveForm — resolve an incident (spec 129) with the postmortem written
 * here, or, when left empty, one Shep drafts from the timeline and actions.
 */

import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import type { RunAction } from '@/hooks/use-run-action';
import { resolveIncident } from '@/app/actions/incidents';

export interface ResolveFormProps {
  incidentId: string;
  run: RunAction;
}

export function ResolveForm({ incidentId, run }: ResolveFormProps) {
  const { t } = useTranslation('web');
  const [postmortem, setPostmortem] = useState('');

  async function submit(event: FormEvent) {
    event.preventDefault();
    const written = postmortem.trim();
    await run(() => resolveIncident(incidentId, written === '' ? undefined : written));
  }

  return (
    <form onSubmit={submit} aria-label={t('incidents.resolve.title')} className="space-y-1.5">
      <Textarea
        value={postmortem}
        onChange={(e) => setPostmortem(e.target.value)}
        placeholder={t('incidents.resolve.placeholder')}
        aria-label={t('incidents.resolve.postmortem')}
        className="min-h-16 text-xs"
        data-testid="incident-postmortem"
      />
      <Button type="submit" size="xs" data-testid="incident-resolve">
        <CheckCircle2 />
        {t('incidents.resolve.submit')}
      </Button>
    </form>
  );
}
