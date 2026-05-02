'use client';

import * as React from 'react';
import { Check, ChevronLeft, ChevronRight, CircleCheck, CircleMinus, Search } from 'lucide-react';
import { getAllAgentModels } from '@/app/actions/get-all-agent-models';
import type { AgentModelGroup, ModelInfo } from '@/app/actions/get-all-agent-models';
import { checkAllAgentsStatus } from '@/app/actions/check-all-agents-status';
import type { AgentInstallMap } from '@/app/actions/check-all-agents-status';
import { updateAgentAndModel } from '@/app/actions/update-agent-and-model';
import { getAgentTypeIcon } from '@/components/common/feature-node/agent-type-icons';
import { getModelMeta } from '@/lib/model-metadata';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

export interface AgentModelPickerProps {
  initialAgentType: string;
  initialModel: string;
  agentType?: string;
  model?: string;
  onAgentModelChange?: (agentType: string, model: string) => void;
  onSave?: (agentType: string, model: string) => Promise<AgentModelPickerSaveResult | void>;
  saveError?: string | null;
  saving?: boolean;
  disabled?: boolean;
  className?: string;
  /** 'settings' persists to DB; 'override' only calls onAgentModelChange */
  mode: 'settings' | 'override';
  /** Show installed/not-installed badges next to agent names */
  showInstallStatus?: boolean;
  /** Which side to open the popover. Defaults to 'bottom'; use 'top' when the trigger is near the bottom of the viewport. */
  popoverSide?: 'top' | 'bottom';
}

export interface AgentModelPickerSaveResult {
  ok: boolean;
  error?: string;
}

export function AgentModelPicker({
  initialAgentType,
  initialModel,
  agentType: controlledAgentType,
  model: controlledModel,
  onAgentModelChange,
  onSave,
  saveError,
  saving,
  disabled,
  className,
  mode,
  showInstallStatus,
  popoverSide = 'bottom',
}: AgentModelPickerProps) {
  const [open, setOpen] = React.useState(false);
  const [groups, setGroups] = React.useState<AgentModelGroup[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [installMap, setInstallMap] = React.useState<AgentInstallMap>({});
  const [agentType, setAgentType] = React.useState(controlledAgentType ?? initialAgentType);
  const [model, setModel] = React.useState(controlledModel ?? initialModel);
  const [internalSaving, setInternalSaving] = React.useState(false);
  const [internalError, setInternalError] = React.useState<string | null>(null);

  // 0 = agent list visible, 1 = model list visible
  const [level, setLevel] = React.useState(0);
  // Which agent's models to show (kept separate from level for animation)
  const [drillAgent, setDrillAgent] = React.useState<string | null>(null);
  // Search query for filtering models (level 1 only)
  const [modelQuery, setModelQuery] = React.useState('');

  React.useEffect(() => {
    getAllAgentModels()
      .then(setGroups)
      .finally(() => setLoading(false));
    if (showInstallStatus) {
      checkAllAgentsStatus().then(setInstallMap);
    }
  }, [showInstallStatus]);

  React.useEffect(() => {
    setAgentType(controlledAgentType ?? initialAgentType);
  }, [controlledAgentType, initialAgentType]);

  React.useEffect(() => {
    setModel(controlledModel ?? initialModel);
  }, [controlledModel, initialModel]);

  // In override mode, fire onAgentModelChange ONCE the picker has its
  // initial values resolved so the parent's "current selection" state
  // matches what the user sees in the trigger button. Without this,
  // a user who never opens the popover (because the displayed default
  // already looks correct) would leave the parent's override state at
  // `undefined`, and the eventual `createApplication` / `sendMessage`
  // call would fall back to the global `settings.agent.type` resolver
  // — which can resolve to a non-interactive agent like `dev` and kill
  // the session boot. Fire-once-on-mount keeps "what you see" === "what
  // gets sent" without forcing the user to click through the picker.
  const hasFiredInitialChangeRef = React.useRef(false);
  React.useEffect(() => {
    if (mode !== 'override') return;
    if (hasFiredInitialChangeRef.current) return;
    if (!agentType) return;
    hasFiredInitialChangeRef.current = true;
    onAgentModelChange?.(agentType, model);
    // Intentionally limited deps — we only want this to fire once the
    // initial values resolve. Subsequent changes flow through the
    // explicit `handleSelect` path.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agentType, model, mode]);

  // Reset drill-down when popover transitions from open → closed (not on initial mount)
  const prevOpenRef = React.useRef(open);
  React.useEffect(() => {
    const wasOpen = prevOpenRef.current;
    prevOpenRef.current = open;
    if (wasOpen && !open) {
      const t = setTimeout(() => {
        setLevel(0);
        setDrillAgent(null);
        setModelQuery('');
      }, 150);
      return () => clearTimeout(t);
    }
  }, [open]);

  const drillInto = (agent: string) => {
    setDrillAgent(agent);
    setModelQuery('');
    requestAnimationFrame(() => {
      requestAnimationFrame(() => setLevel(1));
    });
  };

  const drillBack = () => {
    setLevel(0);
    setModelQuery('');
    setTimeout(() => setDrillAgent(null), 220);
  };

  const filterModels = (models: ModelInfo[]): ModelInfo[] => {
    const q = modelQuery.trim().toLowerCase();
    if (!q) return models;
    return models.filter(
      (m) =>
        m.id.toLowerCase().includes(q) ||
        (m.displayName ?? '').toLowerCase().includes(q) ||
        (m.vendor ?? '').toLowerCase().includes(q) ||
        (m.description ?? '').toLowerCase().includes(q)
    );
  };

  const handleSelect = async (newAgentType: string, newModel: string) => {
    setOpen(false);

    if (newAgentType === agentType && newModel === model) return;

    setInternalError(null);

    if (mode === 'override') {
      setAgentType(newAgentType);
      setModel(newModel);
      onAgentModelChange?.(newAgentType, newModel);
      return;
    }

    const persistSelection =
      onSave ??
      (async (nextAgentType: string, nextModel: string) =>
        updateAgentAndModel(nextAgentType, nextModel || null));

    setInternalSaving(true);
    try {
      const result = await persistSelection(newAgentType, newModel);
      if (result && 'ok' in result && !result.ok) {
        setInternalError(result.error ?? 'Failed to save');
        return;
      }
      setAgentType(newAgentType);
      setModel(newModel);
      onAgentModelChange?.(newAgentType, newModel);
    } catch {
      setInternalError('Failed to save');
    } finally {
      setInternalSaving(false);
    }
  };

  const isDisabled = (disabled ?? false) || loading || (saving ?? false) || internalSaving;
  const error = saveError ?? internalError;

  const AgentIcon = getAgentTypeIcon(agentType);
  const agentLabel = groups.find((g) => g.agentType === agentType)?.label ?? agentType;
  const modelName = model ? getModelMeta(model).displayName || model : null;

  const activeGroup = drillAgent ? groups.find((g) => g.agentType === drillAgent) : null;

  return (
    <div className={cn('flex flex-col gap-1', className)}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            disabled={isDisabled}
            className="w-auto cursor-pointer justify-start font-normal hover:border-violet-300 hover:bg-violet-50/50 dark:hover:border-violet-700 dark:hover:bg-violet-950/30"
          >
            <span className="flex items-center gap-2 truncate">
              <AgentIcon className="h-4 w-4 shrink-0" />
              {loading ? (
                'Loading…'
              ) : (
                <span className="flex items-center gap-1">
                  <span className="text-muted-foreground text-xs">{agentLabel}</span>
                  {modelName ? (
                    <>
                      <span className="text-muted-foreground/50 text-xs">·</span>
                      <span className="text-xs font-medium">{modelName}</span>
                    </>
                  ) : null}
                </span>
              )}
            </span>
          </Button>
        </PopoverTrigger>
        <PopoverContent
          className="z-[70] w-(--radix-popover-trigger-width) overflow-hidden p-0"
          align="start"
          side={popoverSide}
        >
          {/* Sliding container — both panels side by side, translateX controlled by level */}
          <div
            className="flex transition-transform duration-200 ease-in-out"
            style={{ transform: `translateX(${level === 1 ? '-50%' : '0%'})`, width: '200%' }}
          >
            {/* ── Level 1: Agent list ── */}
            <div
              className={cn(
                'max-h-53.75 w-1/2 shrink-0 overflow-y-auto',
                level === 1 && 'h-0 overflow-hidden'
              )}
            >
              <div className="text-muted-foreground border-b px-3 py-2 text-xs font-medium">
                Select agent
              </div>
              {groups.map((group) => {
                const GroupIcon = getAgentTypeIcon(group.agentType);
                const isActive = agentType === group.agentType;
                const hasModels = group.models.length > 0;

                return (
                  <button
                    key={group.agentType}
                    type="button"
                    className={cn(
                      'flex w-full cursor-pointer items-center gap-2.5 px-3 py-2 text-xs transition-colors',
                      'hover:bg-accent hover:text-accent-foreground',
                      isActive && 'bg-accent/50'
                    )}
                    onClick={() => {
                      if (hasModels) {
                        drillInto(group.agentType);
                      } else {
                        handleSelect(group.agentType, '');
                      }
                    }}
                  >
                    <GroupIcon className="h-4 w-4 shrink-0" />
                    <span className="flex-1 text-start">{group.label}</span>
                    {showInstallStatus && group.agentType in installMap ? (
                      installMap[group.agentType] ? (
                        <CircleCheck className="h-3 w-3 shrink-0 text-emerald-500" />
                      ) : (
                        <CircleMinus className="text-muted-foreground/40 h-3 w-3 shrink-0" />
                      )
                    ) : null}
                    {isActive && !hasModels ? (
                      <Check className="text-primary h-3.5 w-3.5 shrink-0" />
                    ) : null}
                    {hasModels ? (
                      <ChevronRight className="text-muted-foreground h-3.5 w-3.5 shrink-0" />
                    ) : null}
                  </button>
                );
              })}
            </div>

            {/* ── Level 2: Model list for selected agent ── */}
            <div
              className={cn(
                'max-h-53.75 w-1/2 shrink-0 overflow-y-auto',
                level === 0 && 'h-0 overflow-hidden'
              )}
            >
              {activeGroup ? (
                <>
                  {/* Back header */}
                  <button
                    type="button"
                    className="text-muted-foreground hover:text-foreground flex w-full cursor-pointer items-center gap-1.5 border-b px-3 py-2 text-xs font-medium transition-colors"
                    onClick={drillBack}
                  >
                    <ChevronLeft className="h-3.5 w-3.5" />
                    {activeGroup.label}
                    <span className="text-muted-foreground/60 ml-auto">
                      {activeGroup.models.length}
                    </span>
                  </button>

                  {/* Search box — shown only when catalog is large enough to warrant it */}
                  {activeGroup.models.length > 8 ? (
                    <div className="bg-background sticky top-0 z-10 border-b px-2 py-1.5">
                      <div className="relative">
                        <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2 h-3 w-3 -translate-y-1/2" />
                        <input
                          type="text"
                          value={modelQuery}
                          onChange={(e) => setModelQuery(e.target.value)}
                          placeholder="Search models…"
                          className="bg-muted/50 placeholder:text-muted-foreground focus:ring-ring w-full rounded-md py-1 pr-2 pl-6 text-xs outline-none focus:ring-1"
                        />
                      </div>
                    </div>
                  ) : null}

                  {/* Model items */}
                  {(() => {
                    const visible = filterModels(activeGroup.models);
                    if (visible.length === 0) {
                      return (
                        <div className="text-muted-foreground px-3 py-4 text-center text-xs">
                          No models match &ldquo;{modelQuery}&rdquo;
                        </div>
                      );
                    }
                    return visible.map((m) => {
                      const isSelected = agentType === activeGroup.agentType && model === m.id;
                      const secondary =
                        m.description ||
                        [
                          m.vendor,
                          m.contextLength ? `${Math.round(m.contextLength / 1000)}k ctx` : null,
                        ]
                          .filter(Boolean)
                          .join(' · ') ||
                        m.id;
                      return (
                        <button
                          key={m.id}
                          type="button"
                          className={cn(
                            'flex w-full cursor-pointer items-center gap-3 px-3 py-2 text-start transition-colors',
                            'hover:bg-accent hover:text-accent-foreground',
                            isSelected && 'bg-accent/50'
                          )}
                          onClick={() => handleSelect(activeGroup.agentType, m.id)}
                        >
                          <div className="flex min-w-0 flex-1 flex-col">
                            <span className="flex items-center gap-1.5 text-xs font-medium">
                              <span className="truncate">{m.displayName}</span>
                              {m.isFree ? (
                                <span className="rounded bg-emerald-100 px-1 py-0 text-[9px] font-semibold tracking-wide text-emerald-700 uppercase dark:bg-emerald-900/40 dark:text-emerald-300">
                                  Free
                                </span>
                              ) : null}
                            </span>
                            <span className="text-muted-foreground truncate text-xs">
                              {secondary}
                            </span>
                          </div>
                          {isSelected ? (
                            <Check className="text-primary h-3.5 w-3.5 shrink-0" />
                          ) : null}
                        </button>
                      );
                    });
                  })()}
                </>
              ) : null}
            </div>
          </div>
        </PopoverContent>
      </Popover>
      {Boolean(error) && <p className="text-destructive text-sm">{error}</p>}
    </div>
  );
}
