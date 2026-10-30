'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { Check, GraduationCap } from 'lucide-react';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import {
  HarnessEnumSelect,
  HarnessNumberInput,
  HarnessSettingRow,
} from './harness-settings-controls';
import { updateSettingsAction, type UpdateSettingsResult } from '@/app/actions/update-settings';
import {
  HarnessAdoptionPolicy,
  HarnessRecursion,
  LearningMode,
  type LearningConfig,
} from '@shepai/core/domain/generated/output';
import { resolveLearningConfig } from '@shepai/core/domain/harness-learning/learning-config';

/** Each unit of k is one base attempt plus three probe or final attempts. */
const ROLLOUTS_PER_K = 4;
const SAVED_FLASH_MS = 2000;

type NumericKey = 'exploreK' | 'exploreMaxCostUsd' | 'alwaysOnCharCap' | 'regressionMinSample';
const NUMERIC_KEYS: readonly NumericKey[] = [
  'exploreK',
  'exploreMaxCostUsd',
  'alwaysOnCharCap',
  'regressionMinSample',
];

export interface SelfLearningSettingsSectionProps {
  learning?: Partial<LearningConfig>;
  /** Saves a settings patch; injectable so stories can show saving and failure. */
  saveSettings?: (patch: { learning: LearningConfig }) => Promise<UpdateSettingsResult>;
}

const asText = (config: LearningConfig): Record<NumericKey, string> =>
  Object.fromEntries(NUMERIC_KEYS.map((k) => [k, String(config[k])])) as Record<NumericKey, string>;

/**
 * Self-learning settings (spec 150): the learning mode, the Explore budget,
 * how candidates are adopted, the always-on text cap and the regression
 * sample. Shown only while the selfLearning flag is on. Every value goes
 * through resolveLearningConfig, so the saved object is always in range.
 */
export function SelfLearningSettingsSection({
  learning,
  saveSettings = updateSettingsAction,
}: SelfLearningSettingsSectionProps) {
  const { t } = useTranslation('web');
  // Keep any stored fields this version does not know about (LESSONS.md: spread, never rebuild).
  const [config, setConfig] = useState<LearningConfig>(() => ({
    ...learning,
    ...resolveLearningConfig(learning),
  }));
  const [text, setText] = useState(() => asText(config));
  const [isPending, startTransition] = useTransition();
  const [showSaved, setShowSaved] = useState(false);
  const prevPendingRef = useRef(false);

  useEffect(() => {
    if (prevPendingRef.current && !isPending) {
      setShowSaved(true);
      const timer = setTimeout(() => setShowSaved(false), SAVED_FLASH_MS);
      return () => clearTimeout(timer);
    }
    prevPendingRef.current = isPending;
  }, [isPending]);

  function save(patch: Partial<LearningConfig>) {
    const next = { ...config, ...resolveLearningConfig({ ...config, ...patch }) };
    setConfig(next);
    setText(asText(next));
    startTransition(async () => {
      const result = await saveSettings({ learning: next });
      if (!result.success) toast.error(result.error ?? t('settings.failedToSave'));
    });
  }

  function commitNumber(key: NumericKey) {
    const parsed = Number(text[key]);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      setText(asText(config));
      return;
    }
    if (parsed !== config[key]) save({ [key]: parsed });
    else setText(asText(config));
  }

  const numberRow = (key: NumericKey, values?: Record<string, number>) => (
    <HarnessSettingRow
      key={key}
      id={`learning-${key}`}
      label={t(`settings.selfLearning.${key}`)}
      description={t(`settings.selfLearning.${key}Description`, values)}
    >
      <HarnessNumberInput
        id={`learning-${key}`}
        value={text[key]}
        onChange={(value) => setText({ ...text, [key]: value })}
        onCommit={() => commitNumber(key)}
      />
    </HarnessSettingRow>
  );

  return (
    <div className="bg-background rounded-lg border" data-testid="self-learning-settings-section">
      <div className="bg-muted/30 border-b px-4 py-3">
        <div className="flex items-center gap-2">
          <GraduationCap className="text-muted-foreground h-3.5 w-3.5" />
          <h2 className="text-sm font-semibold">{t('settings.selfLearning.title')}</h2>
          <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-400">
            {t('settings.selfLearning.experimental')}
          </span>
          {isPending ? (
            <span className="text-muted-foreground text-xs" data-testid="learning-saving">
              {t('settings.saving')}
            </span>
          ) : null}
          {showSaved && !isPending ? (
            <span className="flex items-center gap-1 text-xs text-green-600">
              <Check className="h-3 w-3" />
              {t('settings.saved')}
            </span>
          ) : null}
        </div>
        <p className="text-muted-foreground mt-0.5 text-[11px]">
          {t('settings.selfLearning.description')}
        </p>
      </div>

      <div className="space-y-3 px-4 py-3">
        <HarnessSettingRow
          id="learning-mode"
          label={t('settings.selfLearning.mode')}
          description={t(`settings.selfLearning.modes.${config.mode}Description`)}
        >
          <HarnessEnumSelect
            id="learning-mode"
            value={config.mode}
            options={Object.values(LearningMode)}
            label={(m) => t(`settings.selfLearning.modes.${m}`)}
            onChange={(mode) => save({ mode })}
          />
        </HarnessSettingRow>

        <h3 className="pt-2 text-xs font-semibold">{t('settings.selfLearning.exploreTitle')}</h3>
        {numberRow('exploreK', { rollouts: config.exploreK * ROLLOUTS_PER_K })}
        <HarnessSettingRow
          id="learning-recursion"
          label={t('settings.selfLearning.exploreRecursion')}
          description={t('settings.selfLearning.exploreRecursionDescription')}
        >
          <HarnessEnumSelect
            id="learning-recursion"
            value={config.exploreRecursion}
            options={Object.values(HarnessRecursion)}
            label={(r) => t(`settings.selfLearning.recursion.${r}`)}
            onChange={(exploreRecursion) => save({ exploreRecursion })}
          />
        </HarnessSettingRow>
        {numberRow('exploreMaxCostUsd')}

        <h3 className="pt-2 text-xs font-semibold">{t('settings.selfLearning.adoptionTitle')}</h3>
        <HarnessSettingRow
          id="learning-policy"
          label={t('settings.selfLearning.adoptionPolicy')}
          description={t('settings.selfLearning.adoptionPolicyDescription')}
        >
          <HarnessEnumSelect
            id="learning-policy"
            value={config.adoptionPolicy}
            options={Object.values(HarnessAdoptionPolicy)}
            label={(p) => t(`settings.selfLearning.policies.${p}`)}
            onChange={(adoptionPolicy) => save({ adoptionPolicy })}
          />
        </HarnessSettingRow>
        {numberRow('alwaysOnCharCap')}
        {numberRow('regressionMinSample')}
      </div>
    </div>
  );
}
