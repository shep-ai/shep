'use client';

import { useTranslation } from 'react-i18next';
import { Input } from '@/components/ui/input';
import {
  DecisionProviderKind,
  type DecisionProviderConfig,
} from '@shepai/core/domain/generated/output';
import { HarnessEnumSelect, HarnessSettingRow } from './harness-settings-controls';

const PROVIDER_KINDS: readonly DecisionProviderKind[] = Object.values(DecisionProviderKind);
/** Provider kinds that call their own HTTP endpoint. */
const ENDPOINT_KINDS: ReadonlySet<DecisionProviderKind> = new Set([
  DecisionProviderKind.OpenAiCompatible,
  DecisionProviderKind.Reranker,
  DecisionProviderKind.Jev,
]);

export interface HarnessDecisionProviderFieldsProps {
  provider: DecisionProviderConfig;
  onChange: (provider: DecisionProviderConfig) => void;
}

/**
 * The provider that scores context relevance (spec 119). Deterministic needs
 * nothing; OpenAI-compatible servers, rerankers and Jev take an endpoint, an
 * optional model and the NAME of an env var holding the key (never the key).
 */
export function HarnessDecisionProviderFields({
  provider,
  onChange,
}: HarnessDecisionProviderFieldsProps) {
  const { t } = useTranslation('web');
  const text = (
    key: 'endpoint' | 'model' | 'apiKeyEnv',
    id: string,
    label: string,
    placeholder?: string
  ) => (
    <HarnessSettingRow
      id={id}
      label={t(`settings.harness.${label}`)}
      description={t(`settings.harness.${label}Description`)}
    >
      <Input
        id={id}
        data-testid={id}
        className="w-64 font-mono text-xs"
        placeholder={placeholder}
        defaultValue={provider[key] ?? ''}
        onBlur={(e) => onChange({ ...provider, [key]: e.target.value.trim() || undefined })}
      />
    </HarnessSettingRow>
  );
  return (
    <>
      <h3 className="pt-2 text-xs font-semibold">{t('settings.harness.decisionsTitle')}</h3>
      <p className="text-muted-foreground text-[11px] leading-tight">
        {t('settings.harness.decisionsDescription')}
      </p>
      <HarnessSettingRow
        id="harness-provider-kind"
        label={t('settings.harness.providerKind')}
        description={t('settings.harness.providerKindDescription')}
      >
        <HarnessEnumSelect
          id="harness-provider-kind"
          value={provider.kind}
          options={PROVIDER_KINDS}
          label={(k) => t(`harness.providerKind.${k}`)}
          onChange={(kind) => onChange({ ...provider, kind })}
        />
      </HarnessSettingRow>
      {ENDPOINT_KINDS.has(provider.kind) ? (
        <>
          {text(
            'endpoint',
            'harness-provider-endpoint',
            'providerEndpoint',
            'http://localhost:11434/v1'
          )}
          {text('model', 'harness-provider-model', 'providerModel')}
          {text('apiKeyEnv', 'harness-provider-key', 'providerKeyEnv', 'JEV_API_KEY')}
        </>
      ) : null}
    </>
  );
}
