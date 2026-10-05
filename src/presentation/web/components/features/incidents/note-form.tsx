'use client';

/** NoteForm — add a note to an incident's timeline (spec 129). */

import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { MessageSquarePlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { RunAction } from '@/hooks/use-run-action';
import { noteIncident } from '@/app/actions/incidents';

export interface NoteFormProps {
  incidentId: string;
  run: RunAction;
}

export function NoteForm({ incidentId, run }: NoteFormProps) {
  const { t } = useTranslation('web');
  const [text, setText] = useState('');

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (await run(() => noteIncident(incidentId, text))) setText('');
  }

  return (
    <form onSubmit={submit} aria-label={t('incidents.note.title')} className="flex gap-1.5">
      <Input
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={t('incidents.note.placeholder')}
        aria-label={t('incidents.note.title')}
        className="h-7 flex-1 text-xs"
        data-testid="incident-note-text"
      />
      <Button
        type="submit"
        size="xs"
        variant="outline"
        disabled={!text.trim()}
        data-testid="incident-note-submit"
      >
        <MessageSquarePlus />
        {t('incidents.note.submit')}
      </Button>
    </form>
  );
}
