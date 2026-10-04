'use client';

/**
 * CreateSpaceForm — name, optional description and colour for a new space.
 * The use case derives the slug and validates the colour.
 */

import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { createSpace } from '@/app/actions/manage-spaces';
import { SpaceFields, type SpaceFieldValues } from './space-fields';
import type { RunSpaceAction } from './spaces-types';

const EMPTY: SpaceFieldValues = { name: '', description: '', color: '' };

export interface CreateSpaceFormProps {
  run: RunSpaceAction;
}

export function CreateSpaceForm({ run }: CreateSpaceFormProps) {
  const { t } = useTranslation('web');
  const [values, setValues] = useState<SpaceFieldValues>(EMPTY);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (await run(() => createSpace(values))) setValues(EMPTY);
  }

  return (
    <form
      onSubmit={submit}
      className="flex flex-wrap items-end gap-2 rounded-md border p-3"
      aria-label={t('spaces.create.title')}
    >
      <SpaceFields values={values} onChange={setValues} idPrefix="create-space" />
      <Button
        type="submit"
        size="sm"
        disabled={!values.name.trim()}
        data-testid="create-space-submit"
      >
        <Plus />
        {t('spaces.create.submit')}
      </Button>
    </form>
  );
}
