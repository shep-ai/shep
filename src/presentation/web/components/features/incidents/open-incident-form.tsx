'use client';

/**
 * OpenIncidentForm — open an incident by hand in the page's space
 * (spec 129): what is wrong, how bad it is, and the workload it runs on, so
 * triage can read it and runtime actions can act on it.
 */

import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Siren } from 'lucide-react';
import { IncidentSeverity } from '@shepai/core/domain/generated/output';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NATIVE_SELECT_CLASS } from '@/lib/native-select-class';
import type { RunAction } from '@/hooks/use-run-action';
import { openIncident } from '@/app/actions/incidents';

const EMPTY = { title: '', workload: '', namespace: '', context: '' };
type TextField = keyof typeof EMPTY;

const TEXT_FIELDS: readonly { key: Exclude<TextField, 'title'>; width: string }[] = [
  { key: 'workload', width: 'w-32' },
  { key: 'namespace', width: 'w-28' },
  { key: 'context', width: 'w-28' },
];

export interface OpenIncidentFormProps {
  spaceId: string;
  run: RunAction;
}

export function OpenIncidentForm({ spaceId, run }: OpenIncidentFormProps) {
  const { t } = useTranslation('web');
  const [text, setText] = useState(EMPTY);
  const [severity, setSeverity] = useState<IncidentSeverity>(IncidentSeverity.Major);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const filled = Object.fromEntries(
      Object.entries(text).filter(([, value]) => value.trim() !== '')
    ) as Partial<typeof EMPTY>;
    const opened = await run(() =>
      openIncident({ space: spaceId, severity, ...filled, title: text.title })
    );
    if (opened) setText(EMPTY);
  }

  return (
    <form
      onSubmit={submit}
      aria-label={t('incidents.form.title')}
      className="flex flex-wrap items-center gap-1.5"
    >
      <Input
        value={text.title}
        onChange={(e) => setText((current) => ({ ...current, title: e.target.value }))}
        placeholder={t('incidents.form.placeholder')}
        aria-label={t('incidents.form.incident')}
        className="h-7 min-w-48 flex-1 text-xs"
        data-testid="open-incident-title"
      />
      <select
        value={severity}
        onChange={(e) => setSeverity(e.target.value as IncidentSeverity)}
        aria-label={t('incidents.form.severity')}
        className={`${NATIVE_SELECT_CLASS} h-7`}
        data-testid="open-incident-severity"
      >
        {Object.values(IncidentSeverity).map((option) => (
          <option key={option} value={option}>
            {t(`incidents.severity.${option}`)}
          </option>
        ))}
      </select>
      {TEXT_FIELDS.map((field) => (
        <Input
          key={field.key}
          value={text[field.key]}
          onChange={(e) => setText((current) => ({ ...current, [field.key]: e.target.value }))}
          placeholder={t(`incidents.form.${field.key}`)}
          aria-label={t(`incidents.form.${field.key}`)}
          className={`h-7 ${field.width} font-mono text-xs`}
          data-testid={`open-incident-${field.key}`}
        />
      ))}
      <Button
        type="submit"
        size="xs"
        variant="outline"
        disabled={!text.title.trim()}
        data-testid="open-incident-submit"
      >
        <Siren />
        {t('incidents.form.submit')}
      </Button>
    </form>
  );
}
