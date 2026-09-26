'use client';

import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { EffortSelect } from '@/components/common/effort-select';
import { updateDefaultEffort } from '@/app/actions/update-default-effort';
import type { AgentEffort } from '@shepai/core/domain/generated/output';

export interface EffortSettingsControlProps {
  /** Persisted `settings.models.effort` (absent = agent default). */
  initialEffort?: AgentEffort;
  className?: string;
}

/**
 * Default reasoning effort picker for the settings page. Saves on change and
 * reverts with a toast when the save fails.
 */
export function EffortSettingsControl({ initialEffort, className }: EffortSettingsControlProps) {
  const { t } = useTranslation('web');
  const [effort, setEffort] = useState<AgentEffort | undefined>(initialEffort);
  const [isPending, startTransition] = useTransition();

  function handleChange(next: AgentEffort | undefined) {
    const previous = effort;
    setEffort(next);
    startTransition(async () => {
      const result = await updateDefaultEffort(next ?? null);
      if (!result.ok) {
        setEffort(previous);
        toast.error(result.error ?? t('settings.agent.effortFailed'));
      }
    });
  }

  return (
    <EffortSelect
      id="agent-effort"
      testId="agent-effort-select"
      value={effort}
      onChange={handleChange}
      disabled={isPending}
      className={className}
    />
  );
}
