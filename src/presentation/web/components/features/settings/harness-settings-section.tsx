'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { Check, Workflow } from 'lucide-react';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { HarnessEnumSelect, HarnessSettingRow } from './harness-settings-controls';
import { HarnessDecisionProviderFields } from './harness-decision-provider-fields';
import { updateSettingsAction } from '@/app/actions/update-settings';
import {
  AgentType,
  DecisionProviderKind,
  HarnessBudgetMode,
  HarnessMode,
  PermissionEffect,
  type DecisionProviderConfig,
  type HarnessConfig,
} from '@shepai/core/domain/generated/output';
import { resolveHarnessConfig } from '@shepai/core/domain/harness/harness-config';
import { getAgentDescriptor } from '@shepai/core/domain/shared/agent-catalog';

/** Id of the provider this section manages for context relevance decisions. */
export const CONTEXT_PROVIDER_ID = 'context';
const MINUTE_MS = 60_000;

const BACKENDS: readonly AgentType[] = [
  AgentType.OpenRouter,
  AgentType.TogetherAi,
  AgentType.Ollama,
  AgentType.LlmProxy,
];

export interface HarnessSettingsSectionProps {
  harness?: Partial<HarnessConfig>;
}

type ShadowKey = keyof HarnessConfig['shadow'];
const SHADOW_KEYS: readonly ShadowKey[] = ['contextRouter', 'permissions', 'toolRouter'];
const UNKNOWN_EFFECTS: readonly PermissionEffect[] = [PermissionEffect.Ask, PermissionEffect.Deny];

/**
 * Agent Harness settings (spec 119): context mode, model backend, budgets,
 * shadow modes, permission defaults, and the pluggable decision provider that
 * scores context relevance (deterministic by default; any OpenAI-compatible
 * server, a reranker, the harness's own model, or Jev).
 */
export function HarnessSettingsSection({ harness }: HarnessSettingsSectionProps) {
  const { t } = useTranslation('web');
  const initial = resolveHarnessConfig(harness);
  const contextProvider = initial.decisions.providers.find((p) => p.id === CONTEXT_PROVIDER_ID);
  const [config, setConfig] = useState<HarnessConfig>(initial);
  const [provider, setProvider] = useState<DecisionProviderConfig>(
    contextProvider ?? { id: CONTEXT_PROVIDER_ID, kind: DecisionProviderKind.Deterministic }
  );
  const [maxTurns, setMaxTurns] = useState(String(initial.maxTurns));
  const [timeoutMinutes, setTimeoutMinutes] = useState(
    String(Math.round(initial.permissions.approvalTimeoutMs / MINUTE_MS))
  );
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

  function save(next: HarnessConfig) {
    setConfig(next);
    startTransition(async () => {
      const result = await updateSettingsAction({ harness: next });
      if (!result.success) toast.error(result.error ?? t('settings.failedToSave'));
    });
  }

  function saveProvider(next: DecisionProviderConfig) {
    setProvider(next);
    const others = config.decisions.providers.filter((p) => p.id !== CONTEXT_PROVIDER_ID);
    const deterministic = next.kind === DecisionProviderKind.Deterministic;
    save({
      ...config,
      decisions: {
        ...config.decisions,
        providers: deterministic ? others : [...others, next],
        routes: {
          ...config.decisions.routes,
          chunkVisibility: deterministic ? undefined : CONTEXT_PROVIDER_ID,
        },
      },
    });
  }

  function saveShadow(key: ShadowKey, value: boolean) {
    save({ ...config, shadow: { ...config.shadow, [key]: value } });
  }

  function saveMaxTurns() {
    const parsed = Number.parseInt(maxTurns, 10);
    const next = Number.isFinite(parsed) && parsed > 0 ? parsed : config.maxTurns;
    setMaxTurns(String(next));
    if (next !== config.maxTurns) save({ ...config, maxTurns: next });
  }

  function saveTimeout() {
    const parsed = Number.parseInt(timeoutMinutes, 10);
    const minutes =
      Number.isFinite(parsed) && parsed > 0
        ? parsed
        : Math.round(config.permissions.approvalTimeoutMs / MINUTE_MS);
    setTimeoutMinutes(String(minutes));
    const ms = minutes * MINUTE_MS;
    if (ms !== config.permissions.approvalTimeoutMs) {
      save({ ...config, permissions: { ...config.permissions, approvalTimeoutMs: ms } });
    }
  }

  return (
    <div className="bg-background rounded-lg border" data-testid="harness-settings-section">
      <div className="bg-muted/30 border-b px-4 py-3">
        <div className="flex items-center gap-2">
          <Workflow className="text-muted-foreground h-3.5 w-3.5" />
          <h2 className="text-sm font-semibold">{t('settings.harness.title')}</h2>
          <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-400">
            {t('settings.harness.experimental')}
          </span>
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
          {t('settings.harness.description')}
        </p>
      </div>

      <div className="space-y-3 px-4 py-3">
        <HarnessSettingRow
          id="harness-mode"
          label={t('settings.harness.mode')}
          description={t('settings.harness.modeDescription')}
        >
          <HarnessEnumSelect
            id="harness-mode"
            value={config.mode}
            options={Object.values(HarnessMode)}
            label={(m) => t(`harness.mode.${m}`)}
            onChange={(mode) => save({ ...config, mode })}
          />
        </HarnessSettingRow>
        <HarnessSettingRow
          id="harness-backend"
          label={t('settings.harness.backend')}
          description={t('settings.harness.backendDescription')}
        >
          <HarnessEnumSelect
            id="harness-backend"
            value={config.backendAgentType}
            options={BACKENDS}
            label={(b) => getAgentDescriptor(b)?.label ?? b}
            onChange={(backendAgentType) => save({ ...config, backendAgentType })}
          />
        </HarnessSettingRow>
        <HarnessSettingRow
          id="harness-model"
          label={t('settings.harness.model')}
          description={t('settings.harness.modelDescription')}
        >
          <Input
            id="harness-model"
            data-testid="harness-model"
            className="w-48 text-xs"
            placeholder={t('settings.harness.modelPlaceholder')}
            defaultValue={config.backendModel ?? ''}
            onBlur={(e) => {
              const backendModel = e.target.value.trim();
              if (backendModel !== (config.backendModel ?? ''))
                save({ ...config, backendModel: backendModel || undefined });
            }}
          />
        </HarnessSettingRow>
        <HarnessSettingRow
          id="harness-budget"
          label={t('settings.harness.budget')}
          description={t('settings.harness.budgetDescription')}
        >
          <HarnessEnumSelect
            id="harness-budget"
            value={config.budgetMode}
            options={Object.values(HarnessBudgetMode)}
            label={(b) => t(`harness.budget.${b}`)}
            onChange={(budgetMode) => save({ ...config, budgetMode })}
          />
        </HarnessSettingRow>
        <HarnessSettingRow
          id="harness-max-turns"
          label={t('settings.harness.maxTurns')}
          description={t('settings.harness.maxTurnsDescription')}
        >
          <Input
            id="harness-max-turns"
            data-testid="harness-max-turns"
            type="number"
            min={1}
            className="w-24 text-xs"
            value={maxTurns}
            onChange={(e) => setMaxTurns(e.target.value)}
            onBlur={saveMaxTurns}
          />
        </HarnessSettingRow>

        <HarnessDecisionProviderFields provider={provider} onChange={saveProvider} />

        <h3 className="pt-2 text-xs font-semibold">{t('settings.harness.shadowTitle')}</h3>
        {SHADOW_KEYS.map((key) => (
          <HarnessSettingRow
            key={key}
            id={`harness-shadow-${key}`}
            label={t(`settings.harness.shadow.${key}`)}
            description={t(`settings.harness.shadow.${key}Description`)}
          >
            <Switch
              id={`harness-shadow-${key}`}
              data-testid={`harness-shadow-${key}`}
              checked={config.shadow[key]}
              onCheckedChange={(v) => saveShadow(key, v)}
            />
          </HarnessSettingRow>
        ))}

        <h3 className="pt-2 text-xs font-semibold">{t('settings.harness.permissionsTitle')}</h3>
        <HarnessSettingRow
          id="harness-unknown"
          label={t('settings.harness.unknownDefault')}
          description={t('settings.harness.unknownDefaultDescription')}
        >
          <HarnessEnumSelect
            id="harness-unknown"
            value={config.permissions.defaultUnknown}
            options={UNKNOWN_EFFECTS}
            label={(e) => t(`harness.effect.${e}`)}
            onChange={(defaultUnknown) =>
              save({ ...config, permissions: { ...config.permissions, defaultUnknown } })
            }
          />
        </HarnessSettingRow>
        <HarnessSettingRow
          id="harness-approval-timeout"
          label={t('settings.harness.approvalTimeout')}
          description={t('settings.harness.approvalTimeoutDescription')}
        >
          <Input
            id="harness-approval-timeout"
            data-testid="harness-approval-timeout"
            type="number"
            min={1}
            className="w-24 text-xs"
            value={timeoutMinutes}
            onChange={(e) => setTimeoutMinutes(e.target.value)}
            onBlur={saveTimeout}
          />
        </HarnessSettingRow>
      </div>
    </div>
  );
}
