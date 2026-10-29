'use client';

import { Sparkles } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { MAX_EXPLORE_K } from '@shepai/core/domain/harness-learning/learning-config';

/** Each unit of k is one base attempt plus three probe or final attempts. */
const ROLLOUTS_PER_K = 4;
const K_OPTIONS = Array.from({ length: MAX_EXPLORE_K }, (_, i) => i + 1);

export interface ExploreChoice {
  enabled: boolean;
  k: number;
}

export const NO_EXPLORE: ExploreChoice = { enabled: false, k: 1 };

/** The create-input fields an Explore choice adds; none when it is off. */
export function exploreFields(choice: ExploreChoice): { exploreHarness?: true; exploreK?: number } {
  return choice.enabled ? { exploreHarness: true, exploreK: choice.k } : {};
}

export interface ExploreHarnessRowProps {
  value: ExploreChoice;
  onChange: (value: ExploreChoice) => void;
  disabled?: boolean;
}

/**
 * Per-feature Explore (spec 150): run this feature's implement step as
 * several attempts with different learned-harness variants and keep the best.
 * Rendered by the create drawer only while the selfLearning flag is on.
 */
export function ExploreHarnessRow({ value, onChange, disabled }: ExploreHarnessRowProps) {
  const { t } = useTranslation('web');
  const attempts = value.k * ROLLOUTS_PER_K;
  return (
    <div
      className="border-input flex items-center gap-4 rounded-md border px-3 py-2.5"
      data-testid="explore-harness-row"
    >
      <span className="text-muted-foreground w-16 shrink-0 text-xs font-semibold tracking-wider">
        {t('createDrawer.explore.label')}
      </span>
      <div className="flex flex-1 flex-wrap items-center gap-3">
        <div className="flex items-center gap-1.5">
          <Switch
            id="explore-harness"
            size="sm"
            checked={value.enabled}
            onCheckedChange={(enabled) => onChange({ ...value, enabled })}
            disabled={disabled}
            data-testid="explore-harness-switch"
          />
          <Label
            htmlFor="explore-harness"
            className="flex cursor-pointer items-center gap-1 text-xs font-medium"
          >
            <Sparkles className="h-3 w-3" />
            {t('createDrawer.explore.toggle')}
          </Label>
        </div>
        {value.enabled ? (
          <>
            <Select
              value={String(value.k)}
              onValueChange={(k) => onChange({ ...value, k: Number(k) })}
              disabled={disabled}
            >
              <SelectTrigger
                className="h-7 w-20 text-xs"
                data-testid="explore-harness-k"
                aria-label={t('createDrawer.explore.k')}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {K_OPTIONS.map((k) => (
                  <SelectItem key={k} value={String(k)}>
                    k = {k}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <span className="text-muted-foreground text-[11px]" data-testid="explore-harness-cost">
              {t('createDrawer.explore.cost', { attempts })}
            </span>
          </>
        ) : null}
      </div>
    </div>
  );
}
