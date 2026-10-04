'use client';

/**
 * EditSpaceForm — rename a space or change its description or colour. Clearing
 * the description or colour removes it.
 */

import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import type { Space } from '@shepai/core/domain/generated/output';
import { Button } from '@/components/ui/button';
import { updateSpace } from '@/app/actions/manage-spaces';
import { SpaceFields, type SpaceFieldValues } from './space-fields';
import type { RunSpaceAction } from './spaces-types';

export interface EditSpaceFormProps {
  space: Space;
  run: RunSpaceAction;
  onDone: () => void;
}

export function EditSpaceForm({ space, run, onDone }: EditSpaceFormProps) {
  const { t } = useTranslation('web');
  const [values, setValues] = useState<SpaceFieldValues>({
    name: space.name,
    description: space.description ?? '',
    color: space.color ?? '',
  });

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (await run(() => updateSpace(space.id, values))) onDone();
  }

  return (
    <form
      onSubmit={submit}
      className="flex flex-wrap items-end gap-2"
      aria-label={t('spaces.card.edit')}
    >
      <SpaceFields values={values} onChange={setValues} idPrefix="edit-space" />
      <div className="flex gap-1">
        <Button type="button" variant="ghost" size="sm" onClick={onDone}>
          {t('spaces.deleteDialog.cancel')}
        </Button>
        <Button
          type="submit"
          size="sm"
          disabled={!values.name.trim()}
          data-testid="edit-space-submit"
        >
          {t('spaces.card.save')}
        </Button>
      </div>
    </form>
  );
}
