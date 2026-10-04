'use client';

/**
 * MemorySpaceFilter — narrows the memory page to one space (spec 120). Hidden
 * when there is only one space, because there is nothing to choose between.
 */

import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import type { MemorySpaceOption } from './memory-space-option';

/** Filter value meaning "every space". */
export const ALL_SPACES = 'all';

export interface MemorySpaceFilterProps {
  spaces: MemorySpaceOption[];
  value: string;
  onChange: (value: string) => void;
}

export function MemorySpaceFilter({ spaces, value, onChange }: MemorySpaceFilterProps) {
  const { t } = useTranslation('web');
  if (spaces.length < 2) return null;

  const options = [
    { id: ALL_SPACES, name: t('memory.filter.allSpaces'), color: undefined },
    ...spaces,
  ];

  return (
    <div
      role="group"
      aria-label={t('memory.filter.label')}
      className="flex flex-wrap items-center gap-1"
    >
      {options.map((option) => (
        <Button
          key={option.id}
          size="xs"
          variant={value === option.id ? 'default' : 'ghost'}
          aria-pressed={value === option.id}
          onClick={() => onChange(option.id)}
          data-testid={`project-memory-space-filter-${option.id}`}
          className="gap-1.5"
        >
          {option.color ? (
            <span
              aria-hidden="true"
              className="size-2 rounded-full"
              style={{ backgroundColor: option.color }}
            />
          ) : null}
          {option.name}
        </Button>
      ))}
    </div>
  );
}
