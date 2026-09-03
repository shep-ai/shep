'use client';

import { useState, useTransition, useRef, useEffect, useCallback } from 'react';
import { Gauge, Check, Info } from 'lucide-react';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { updateSettingsAction } from '@/app/actions/update-settings';
import { getAdaptiveModelPlan } from '@/app/actions/get-adaptive-model-plan';
import type { AdaptiveModelConfig } from '@shepai/core/domain/generated/output';

/** Sentinel for "no override — derive this tier from the pinned model". */
const DERIVED = '__derived__';

type Tier = 'high' | 'medium' | 'low';

const TIERS: readonly Tier[] = ['high', 'medium', 'low'];

interface ResolvedPlan {
  agentType: string;
  baseModel: string;
  tiers: Record<Tier, string>;
  supportedModels: string[];
  degradesToSingleModel: boolean;
}

export interface AdaptiveModelSettingsSectionProps {
  adaptive?: AdaptiveModelConfig;
}

/**
 * Adaptive per-task model tier selection.
 *
 * Shows the user exactly which model each complexity tier resolves to under
 * their current agent + pinned model BEFORE they enable the mode, because the
 * answer depends on what their agent's catalog actually serves — the pin is a
 * ceiling, and some pins have no cheaper sibling at all.
 */
export function AdaptiveModelSettingsSection({ adaptive }: AdaptiveModelSettingsSectionProps) {
  const { t } = useTranslation('web');
  const [enabled, setEnabled] = useState(adaptive?.enabled ?? false);
  const [overrides, setOverrides] = useState<Partial<Record<Tier, string>>>({
    high: adaptive?.high,
    medium: adaptive?.medium,
    low: adaptive?.low,
  });
  const [plan, setPlan] = useState<ResolvedPlan | null>(null);
  const [planError, setPlanError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [showSaved, setShowSaved] = useState(false);
  const prevPendingRef = useRef(false);

  useEffect(() => {
    if (prevPendingRef.current && !isPending) {
      setShowSaved(true);
      const timer = setTimeout(() => setShowSaved(false), 2000);
      return () => clearTimeout(timer);
    }
    prevPendingRef.current = isPending;
  }, [isPending]);

  const refreshPlan = useCallback(async () => {
    const result = await getAdaptiveModelPlan();
    if (result.plan) {
      setPlan({
        agentType: result.plan.agentType,
        baseModel: result.plan.baseModel,
        tiers: result.plan.tiers,
        supportedModels: result.plan.supportedModels,
        degradesToSingleModel: result.plan.degradesToSingleModel,
      });
      setPlanError(null);
    } else {
      setPlanError(result.error ?? t('settings.adaptiveModels.planUnavailable'));
    }
  }, [t]);

  useEffect(() => {
    void refreshPlan();
  }, [refreshPlan]);

  function save(next: AdaptiveModelConfig, revert: () => void) {
    startTransition(async () => {
      const result = await updateSettingsAction({ models: { adaptive: next } });
      if (!result.success) {
        toast.error(result.error ?? t('settings.failedToSave'));
        revert();
        return;
      }
      await refreshPlan();
    });
  }

  function currentConfig(): AdaptiveModelConfig {
    return {
      enabled,
      ...(overrides.high ? { high: overrides.high } : {}),
      ...(overrides.medium ? { medium: overrides.medium } : {}),
      ...(overrides.low ? { low: overrides.low } : {}),
    };
  }

  function handleToggle(next: boolean) {
    const previous = enabled;
    setEnabled(next);
    save({ ...currentConfig(), enabled: next }, () => setEnabled(previous));
  }

  function handleOverrideChange(tier: Tier, value: string) {
    const previous = overrides;
    // The Select cannot hold an empty value, so DERIVED stands in for "unset".
    const nextOverrides = { ...overrides, [tier]: value === DERIVED ? undefined : value };
    setOverrides(nextOverrides);

    const next: AdaptiveModelConfig = { enabled };
    for (const key of TIERS) {
      const model = nextOverrides[key];
      if (model) next[key] = model;
    }
    save(next, () => setOverrides(previous));
  }

  return (
    <div className="bg-background rounded-lg border" data-testid="adaptive-model-settings-section">
      <div className="bg-muted/30 border-b px-4 py-3">
        <div className="flex items-center gap-2">
          <Gauge className="text-muted-foreground h-3.5 w-3.5" />
          <h2 className="text-sm font-semibold">{t('settings.adaptiveModels.title')}</h2>
          {isPending ? (
            <span className="text-muted-foreground text-xs">{t('settings.saving')}</span>
          ) : null}
          {showSaved && !isPending ? (
            <span className="flex items-center gap-1 text-xs text-green-600">
              <Check className="h-3 w-3" />
              {t('settings.saved')}
            </span>
          ) : null}
        </div>
        <p className="text-muted-foreground mt-0.5 text-[11px]">
          {t('settings.adaptiveModels.description')}
        </p>
      </div>

      <div className="px-4">
        <div className="flex items-center justify-between gap-4 border-b py-2.5">
          <div className="min-w-0">
            <label htmlFor="adaptive-models-enabled" className="cursor-pointer text-sm font-normal">
              {t('settings.adaptiveModels.enabled')}
            </label>
            <p className="text-muted-foreground text-[11px] leading-tight">
              {t('settings.adaptiveModels.enabledDescription')}
            </p>
          </div>
          <Switch
            id="adaptive-models-enabled"
            data-testid="adaptive-models-toggle"
            checked={enabled}
            onCheckedChange={handleToggle}
          />
        </div>

        {planError ? (
          <p
            className="text-muted-foreground py-2.5 text-[11px]"
            data-testid="adaptive-models-error"
          >
            {planError}
          </p>
        ) : null}

        {plan ? (
          <>
            <div className="flex items-center gap-2 border-b py-2.5">
              <Info className="text-muted-foreground h-3.5 w-3.5 shrink-0" />
              <p className="text-muted-foreground text-[11px] leading-tight">
                {t('settings.adaptiveModels.ceilingHint', {
                  model: plan.baseModel,
                  agent: plan.agentType,
                })}
              </p>
            </div>

            {plan.degradesToSingleModel ? (
              <p
                className="text-muted-foreground py-2.5 text-[11px] leading-tight"
                data-testid="adaptive-models-single-model-hint"
              >
                {t('settings.adaptiveModels.singleModelHint', { model: plan.baseModel })}
              </p>
            ) : null}

            {TIERS.map((tier) => (
              <div key={tier} className="flex items-center justify-between gap-4 border-b py-2.5">
                <div className="min-w-0">
                  <label
                    htmlFor={`adaptive-models-${tier}`}
                    className="flex items-center gap-2 text-sm font-normal"
                  >
                    {t(`settings.adaptiveModels.tiers.${tier}`)}
                    <Badge variant="secondary" className="font-mono text-[10px]">
                      {plan.tiers[tier]}
                    </Badge>
                  </label>
                  <p className="text-muted-foreground text-[11px] leading-tight">
                    {t(`settings.adaptiveModels.tiers.${tier}Description`)}
                  </p>
                </div>
                <Select
                  value={overrides[tier] ?? DERIVED}
                  onValueChange={(value) => handleOverrideChange(tier, value)}
                >
                  <SelectTrigger
                    id={`adaptive-models-${tier}`}
                    data-testid={`adaptive-models-${tier}-select`}
                    className="w-52 cursor-pointer text-xs"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={DERIVED}>{t('settings.adaptiveModels.derived')}</SelectItem>
                    {plan.supportedModels.map((model) => (
                      <SelectItem key={model} value={model}>
                        {model}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ))}
          </>
        ) : null}
      </div>
    </div>
  );
}
