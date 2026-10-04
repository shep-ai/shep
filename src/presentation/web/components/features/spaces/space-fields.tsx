'use client';

/**
 * SpaceFields — the name, description and colour inputs shared by the create
 * and edit space forms. `idPrefix` keeps their test ids distinct.
 */

import { useTranslation } from 'react-i18next';
import { Input } from '@/components/ui/input';

export interface SpaceFieldValues {
  name: string;
  description: string;
  color: string;
}

export interface SpaceFieldsProps {
  values: SpaceFieldValues;
  onChange: (values: SpaceFieldValues) => void;
  idPrefix: string;
}

export function SpaceFields({ values, onChange, idPrefix }: SpaceFieldsProps) {
  const { t } = useTranslation('web');
  const set = (field: keyof SpaceFieldValues) => (value: string) =>
    onChange({ ...values, [field]: value });

  return (
    <>
      <label className="flex flex-col gap-1 text-xs">
        {t('spaces.create.name')}
        <Input
          value={values.name}
          onChange={(e) => set('name')(e.target.value)}
          placeholder={t('spaces.create.namePlaceholder')}
          className="h-8 w-40 text-sm"
          data-testid={`${idPrefix}-name`}
        />
      </label>
      <label className="flex min-w-48 flex-1 flex-col gap-1 text-xs">
        {t('spaces.create.description')}
        <Input
          value={values.description}
          onChange={(e) => set('description')(e.target.value)}
          placeholder={t('spaces.create.descriptionPlaceholder')}
          className="h-8 text-sm"
          data-testid={`${idPrefix}-description`}
        />
      </label>
      <label className="flex flex-col gap-1 text-xs">
        {t('spaces.create.color')}
        <Input
          value={values.color}
          onChange={(e) => set('color')(e.target.value)}
          placeholder="#3456c4"
          className="h-8 w-28 font-mono text-sm"
          data-testid={`${idPrefix}-color`}
        />
      </label>
    </>
  );
}
