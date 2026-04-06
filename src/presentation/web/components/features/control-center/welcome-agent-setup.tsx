'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { ChevronLeft, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { getAllAgentModels } from '@/app/actions/get-all-agent-models';
import type { AgentModelGroup } from '@/app/actions/get-all-agent-models';
import { updateAgentAndModel } from '@/app/actions/update-agent-and-model';
import { getAgentTypeIcon } from '@/components/common/feature-node/agent-type-icons';
import { getModelMeta } from '@/lib/model-metadata';
import { cn } from '@/lib/utils';

export interface WelcomeAgentSetupProps {
  onComplete: () => void;
  className?: string;
}

type SetupStep = 'select-agent' | 'select-model';

const STEPS: SetupStep[] = ['select-agent', 'select-model'];

export function WelcomeAgentSetup({ onComplete, className }: WelcomeAgentSetupProps) {
  const { t } = useTranslation('web');
  const [groups, setGroups] = useState<AgentModelGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [step, setStep] = useState<SetupStep>('select-agent');
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [transitioning, setTransitioning] = useState(false);
  const [visible, setVisible] = useState(true);
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    getAllAgentModels()
      .then(setGroups)
      .finally(() => setLoading(false));
  }, []);

  const activeGroup = selectedAgent ? groups.find((g) => g.agentType === selectedAgent) : null;

  const transitionTo = useCallback((nextStep: SetupStep, setup?: () => void) => {
    setTransitioning(true);
    setVisible(false);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      setup?.();
      setStep(nextStep);
      requestAnimationFrame(() => {
        setVisible(true);
        setTransitioning(false);
      });
    }, 150);
  }, []);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  const saveAndComplete = useCallback(
    async (agentType: string, model: string | null) => {
      setSaving(true);
      try {
        await updateAgentAndModel(agentType, model);
        // Fade out the entire wizard before handing off to the next view
        setVisible(false);
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        timeoutRef.current = setTimeout(() => {
          onComplete();
        }, 200);
      } catch {
        setSaving(false);
      }
    },
    [onComplete]
  );

  const handleAgentSelect = useCallback(
    (agentType: string) => {
      const group = groups.find((g) => g.agentType === agentType);
      if (group && group.models.length > 0) {
        transitionTo('select-model', () => {
          setSelectedAgent(agentType);
        });
      } else {
        saveAndComplete(agentType, null);
      }
    },
    [groups, transitionTo, saveAndComplete]
  );

  const handleModelSelect = useCallback(
    (model: string) => {
      if (!selectedAgent) return;
      saveAndComplete(selectedAgent, model);
    },
    [selectedAgent, saveAndComplete]
  );

  const handleBack = useCallback(() => {
    if (step === 'select-model') {
      transitionTo('select-agent', () => {
        setSelectedAgent(null);
      });
    }
  }, [step, transitionTo]);

  if (loading) {
    return (
      <div
        data-testid="welcome-agent-setup"
        className={cn('flex flex-col items-center justify-center gap-4', className)}
      >
        <Loader2 className="text-muted-foreground h-5 w-5 animate-spin" />
        <p className="text-muted-foreground text-sm">{t('welcome.loadingAgents')}</p>
      </div>
    );
  }

  const stepIndex = STEPS.indexOf(step);

  // Dynamic hero text per step
  const heroTitle = step === 'select-agent' ? t('welcome.chooseAgent') : t('welcome.pickModel');

  const heroSubtitle =
    step === 'select-agent'
      ? t('welcome.selectAgentSubtitle')
      : activeGroup
        ? t('welcome.chooseModelSubtitle', { label: activeGroup.label })
        : '';

  return (
    <div
      data-testid="welcome-agent-setup"
      className={cn('flex w-full flex-col items-center', className)}
    >
      {/* Step indicator — stays visible across transitions */}
      <div className="mb-8 flex w-full max-w-xs items-center gap-1.5">
        {STEPS.map((s, i) => (
          <div
            key={s}
            className={cn(
              'h-[3px] flex-1 rounded-full transition-colors duration-300',
              i <= stepIndex ? 'bg-foreground/60' : 'bg-muted'
            )}
          />
        ))}
      </div>

      {/* Hero + content — all fade together on step transitions */}
      <div
        className={cn(
          'flex w-full flex-col items-center transition-opacity duration-200',
          visible && !transitioning ? 'opacity-100' : 'opacity-0'
        )}
      >
        <h1 className="text-foreground/90 text-center text-5xl font-extralight tracking-tight">
          {heroTitle}
        </h1>
        <p className="text-muted-foreground mt-3 text-center text-lg leading-relaxed font-light">
          {heroSubtitle}
        </p>

        <div className="mt-8 flex w-full flex-col items-center">
          {/* Step 1: Agent selection — horizontal grid */}
          {step === 'select-agent' && (
            <div
              data-testid="agent-list"
              className="grid w-full max-w-lg gap-3"
              style={{
                gridTemplateColumns: `repeat(${Math.min(groups.length, 4)}, minmax(0, 1fr))`,
              }}
            >
              {groups.map((group) => {
                const GroupIcon = getAgentTypeIcon(group.agentType);
                return (
                  <button
                    key={group.agentType}
                    type="button"
                    disabled={saving}
                    data-testid={`agent-option-${group.agentType}`}
                    className="border-border hover:bg-accent hover:border-foreground/20 flex cursor-pointer flex-col items-center gap-3 rounded-2xl border px-4 py-5 transition-all duration-150 active:scale-[0.97] disabled:opacity-50"
                    onClick={() => handleAgentSelect(group.agentType)}
                  >
                    <GroupIcon className="text-foreground/70 h-7 w-7" />
                    <span className="text-sm font-medium">{group.label}</span>
                  </button>
                );
              })}
            </div>
          )}

          {/* Step 2: Model selection — horizontal grid */}
          {step === 'select-model' && activeGroup ? (
            <div
              data-testid="model-list"
              className="flex w-full max-w-lg flex-col items-center gap-4"
            >
              <button
                type="button"
                disabled={saving}
                className="text-muted-foreground hover:text-foreground flex cursor-pointer items-center gap-1.5 self-start text-sm transition-colors"
                onClick={handleBack}
              >
                <ChevronLeft className="h-4 w-4" />
                {t('welcome.back')}
              </button>
              <div
                className="grid w-full gap-3"
                style={{
                  gridTemplateColumns: `repeat(${Math.min(activeGroup.models.length, 3)}, minmax(0, 1fr))`,
                }}
              >
                {activeGroup.models.map((m) => {
                  const meta = getModelMeta(m.id);
                  return (
                    <button
                      key={m.id}
                      type="button"
                      disabled={saving}
                      data-testid={`model-option-${m.id}`}
                      className="border-border hover:bg-accent hover:border-foreground/20 flex cursor-pointer flex-col items-center gap-2 rounded-2xl border px-4 py-5 text-center transition-all duration-150 active:scale-[0.97] disabled:opacity-50"
                      onClick={() => handleModelSelect(m.id)}
                    >
                      <span className="text-sm font-medium">
                        {meta.displayName || m.displayName}
                      </span>
                      <span className="text-muted-foreground text-xs leading-tight">
                        {meta.description || m.description}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
