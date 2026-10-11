'use client';

import { Check } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { DecisionOption } from '@shepai/core/domain/generated/output';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

/** Options 1–9 have keyboard shortcuts. */
export const DECISION_SHORTCUT_COUNT = 9;

export interface DecisionOptionRowProps {
  option: DecisionOption;
  index: number;
  selected: boolean;
  disabled: boolean;
  onSelect: (optionId: string) => void;
  onFocusOption?: (optionId: string | null) => void;
}

/** One option: bold label, muted description, and a 1–9 key hint that turns into a check. */
export function DecisionOptionRow({
  option,
  index,
  selected,
  disabled,
  onSelect,
  onFocusOption,
}: DecisionOptionRowProps) {
  const { t } = useTranslation('web');
  const shortcut = index < DECISION_SHORTCUT_COUNT ? index + 1 : null;
  const testId = `decision-option-${option.id}`;
  return (
    <button
      type="button"
      data-testid={testId}
      aria-pressed={selected}
      disabled={disabled}
      onClick={() => onSelect(option.id)}
      onMouseEnter={() => onFocusOption?.(option.id)}
      onMouseLeave={() => onFocusOption?.(null)}
      onFocus={() => onFocusOption?.(option.id)}
      className={cn(
        'focus-visible:ring-primary/25 flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-start transition-colors duration-150 outline-none focus-visible:ring-1',
        selected ? 'bg-muted/60 text-foreground' : 'text-foreground/85 hover:bg-muted/30',
        option.isNew && 'animate-option-highlight',
        disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'
      )}
    >
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex flex-wrap items-center gap-1.5 text-sm font-medium wrap-break-word">
          {option.label}
          {option.recommended ? (
            <Badge
              data-testid={`${testId}-recommended`}
              variant="secondary"
              className="px-1.5 py-0 text-[10px] whitespace-nowrap"
            >
              {t('decision.recommended')}
            </Badge>
          ) : null}
          {option.isNew ? (
            <Badge
              data-testid={`${testId}-new`}
              className="border-transparent bg-emerald-600 px-1.5 py-0 text-[10px] whitespace-nowrap text-white hover:bg-emerald-600/80"
            >
              {t('decision.new')}
            </Badge>
          ) : null}
        </span>
        {option.description && option.description !== option.label ? (
          <span className="text-muted-foreground text-xs">{option.description}</span>
        ) : null}
      </div>
      {selected ? (
        <Check data-testid={`${testId}-check`} className="text-primary size-3.5 shrink-0" />
      ) : shortcut !== null ? (
        <kbd
          data-testid={`${testId}-key`}
          className="text-muted-foreground flex size-5 shrink-0 items-center justify-center text-[10px] font-medium tabular-nums"
        >
          {shortcut}
        </kbd>
      ) : null}
    </button>
  );
}
