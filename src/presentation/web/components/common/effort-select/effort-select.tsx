'use client';

import { useTranslation } from 'react-i18next';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import type { AgentEffort } from '@shepai/core/domain/generated/output';
import { AGENT_EFFORT_LEVELS, parseAgentEffort } from '@shepai/core/domain/shared/agent-effort';

/** Select value standing in for "no effort set": a Select cannot hold an empty value. */
export const AGENT_DEFAULT_EFFORT_VALUE = '__agent-default__';

/** Select value → effort (`undefined` = the agent's own default). */
export function effortFromSelectValue(value: string): AgentEffort | undefined {
  return parseAgentEffort(value);
}

/** Effort → Select value. */
export function selectValueFromEffort(effort: AgentEffort | undefined): string {
  return effort ?? AGENT_DEFAULT_EFFORT_VALUE;
}

export interface EffortSelectProps {
  /** Selected effort; undefined means "agent default". */
  value?: AgentEffort;
  /** Called with the new effort, or undefined when "agent default" is picked. */
  onChange: (effort: AgentEffort | undefined) => void;
  /** id for the trigger, so a <label htmlFor> can point at it. */
  id?: string;
  /** data-testid for the trigger (default: "effort-select"). */
  testId?: string;
  /** Label for the unset option (default: "Agent default"). */
  defaultLabel?: string;
  /** Accessible name when no visible <label> points at the trigger. */
  ariaLabel?: string;
  disabled?: boolean;
  className?: string;
}

/**
 * Picks a reasoning effort level, with an explicit "Agent default" option for
 * leaving it unset. Used by the settings page (global default) and the feature
 * create drawer (per-feature override).
 */
export function EffortSelect({
  value,
  onChange,
  id,
  testId = 'effort-select',
  defaultLabel,
  ariaLabel,
  disabled,
  className,
}: EffortSelectProps) {
  const { t } = useTranslation('web');

  return (
    <Select
      value={selectValueFromEffort(value)}
      onValueChange={(next) => onChange(effortFromSelectValue(next))}
      disabled={disabled}
    >
      <SelectTrigger
        id={id}
        data-testid={testId}
        aria-label={ariaLabel}
        className={cn('w-44 cursor-pointer text-xs', className)}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={AGENT_DEFAULT_EFFORT_VALUE} data-testid={`${testId}-option-default`}>
          {defaultLabel ?? t('effortSelect.agentDefault')}
        </SelectItem>
        {AGENT_EFFORT_LEVELS.map((level) => (
          <SelectItem key={level} value={level} data-testid={`${testId}-option-${level}`}>
            {t(`effortSelect.levels.${level}`)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
