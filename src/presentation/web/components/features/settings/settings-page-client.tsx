'use client';

import { useState, useTransition, useRef, useEffect, useCallback } from 'react';
import {
  Check,
  Bot,
  Terminal,
  GitBranch,
  Activity,
  Bell,
  Flag,
  Database,
  Globe,
  Minus,
  Plus,
  ExternalLink,
  Settings2,
  Timer,
  MessageSquare,
  LayoutGrid,
} from 'lucide-react';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { updateSettingsAction } from '@/app/actions/update-settings';
import {
  type AgentType,
  EditorType,
  Language,
  TerminalType,
} from '@shepai/core/domain/generated/output';
import { getEditorTypeIcon } from '@/components/common/editor-type-icons';
import { AgentModelPicker } from '@/components/features/settings/AgentModelPicker';
import { LanguageSettingsSection } from '@/components/features/settings/language-settings-section';
import { TimeoutSlider } from '@/components/features/settings/timeout-slider';
import type {
  Settings,
  FeatureFlags,
  NotificationPreferences,
  InteractiveAgentConfig,
  FabLayoutConfig,
} from '@shepai/core/domain/generated/output';
import type { AvailableTerminal } from '@/app/actions/get-available-terminals';

const EDITOR_OPTIONS = [
  { value: EditorType.VsCode, label: 'VS Code' },
  { value: EditorType.Cursor, label: 'Cursor' },
  { value: EditorType.Windsurf, label: 'Windsurf' },
  { value: EditorType.Zed, label: 'Zed' },
  { value: EditorType.Antigravity, label: 'Antigravity' },
];

const SHELL_OPTIONS = [
  { value: 'bash', label: 'Bash' },
  { value: 'zsh', label: 'Zsh' },
  { value: 'fish', label: 'Fish' },
];

const SECTIONS = [
  { id: 'language', labelKey: 'settings.sections.language', icon: Globe },
  { id: 'agent', labelKey: 'settings.sections.agent', icon: Bot },
  { id: 'environment', labelKey: 'settings.sections.environment', icon: Terminal },
  { id: 'workflow', labelKey: 'settings.sections.workflow', icon: GitBranch },
  { id: 'ci', labelKey: 'settings.sections.ci', icon: Activity },
  { id: 'stage-timeouts', labelKey: 'settings.sections.timeouts', icon: Timer },
  { id: 'notifications', labelKey: 'settings.sections.notifications', icon: Bell },
  { id: 'feature-flags', labelKey: 'settings.sections.flags', icon: Flag },
  { id: 'interactive-agent', labelKey: 'settings.sections.chat', icon: MessageSquare },
  { id: 'fab-layout', labelKey: 'settings.sections.layout', icon: LayoutGrid },
  { id: 'database', labelKey: 'settings.sections.database', icon: Database },
] as const;

export interface SettingsPageClientProps {
  settings: Settings;
  shepHome: string;
  dbFileSize: string;
  availableTerminals?: AvailableTerminal[];
}

function useSaveIndicator() {
  const { t } = useTranslation('web');
  const [isPending, startTransition] = useTransition();
  const [showSaving, setShowSaving] = useState(false);
  const [showSaved, setShowSaved] = useState(false);
  const minTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingDoneRef = useRef(false);

  // Show "Saving..." with a minimum display time of 600ms
  useEffect(() => {
    if (isPending && !showSaving) {
      setShowSaving(true);
      pendingDoneRef.current = false;
      minTimerRef.current = setTimeout(() => {
        minTimerRef.current = null;
        if (pendingDoneRef.current) {
          setShowSaving(false);
          setShowSaved(true);
          setTimeout(() => setShowSaved(false), 2000);
        }
      }, 350);
    }
    if (!isPending && showSaving) {
      pendingDoneRef.current = true;
      // If min timer already elapsed, transition now
      if (!minTimerRef.current) {
        setShowSaving(false);
        setShowSaved(true);
        setTimeout(() => setShowSaved(false), 2000);
      }
    }
  }, [isPending, showSaving]);

  const save = useCallback(
    (payload: Record<string, unknown>) => {
      startTransition(async () => {
        const result = await updateSettingsAction(payload);
        if (!result.success) {
          toast.error(result.error ?? t('settings.failedToSave'));
        }
      });
    },
    [startTransition, t]
  );

  return { showSaving, showSaved, save };
}

/* ── Reusable row components ── */

function SettingsRow({
  label,
  description,
  htmlFor,
  children,
}: {
  label: string;
  description?: string;
  htmlFor?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4 border-b py-2.5 last:border-b-0">
      <div className="min-w-0">
        <Label htmlFor={htmlFor} className="cursor-pointer text-sm font-normal whitespace-nowrap">
          {label}
        </Label>
        {description ? (
          <p className="text-muted-foreground text-[11px] leading-tight">{description}</p>
        ) : null}
      </div>
      <div className="flex shrink-0 items-center gap-2">{children}</div>
    </div>
  );
}

function SwitchRow({
  label,
  description,
  id,
  testId,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  description?: string;
  id: string;
  testId: string;
  checked: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <SettingsRow label={label} description={description} htmlFor={id}>
      <Switch
        id={id}
        data-testid={testId}
        checked={checked}
        onCheckedChange={onChange}
        disabled={disabled}
        className={cn('cursor-pointer', disabled && 'cursor-not-allowed opacity-50')}
      />
    </SettingsRow>
  );
}

/* ── Section card wrapper ── */

function SettingsSection({
  icon: Icon,
  title,
  description,
  badge,
  testId,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  badge?: string;
  testId: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-background rounded-lg border" data-testid={testId}>
      <div className="bg-muted/30 border-b px-4 py-3">
        <div className="flex items-center gap-2">
          <Icon className="text-muted-foreground h-3.5 w-3.5" />
          <h2 className="text-sm font-semibold">{title}</h2>
          {badge ? (
            <span className="bg-muted text-muted-foreground rounded px-1.5 py-0.5 text-[9px] font-medium tracking-wider uppercase">
              {badge}
            </span>
          ) : null}
        </div>
        <p className="text-muted-foreground mt-0.5 text-[11px]">{description}</p>
      </div>
      <div className="px-4">{children}</div>
    </div>
  );
}

function NumberStepper({
  id,
  testId,
  value,
  onChange,
  onBlur,
  placeholder,
  min = 1,
  max,
  step = 1,
  suffix,
}: {
  id: string;
  testId: string;
  value: string;
  onChange: (value: string) => void;
  onBlur: () => void;
  placeholder: string;
  min?: number;
  max?: number;
  step?: number;
  suffix?: string;
}) {
  const { t } = useTranslation('web');
  const numValue = value === '' ? undefined : parseInt(value, 10);

  const decrement = () => {
    const current = numValue ?? parseInt(placeholder, 10);
    const next = Math.max(min, current - step);
    onChange(String(next));
  };

  const increment = () => {
    const current = numValue ?? parseInt(placeholder, 10);
    const next = max != null ? Math.min(max, current + step) : current + step;
    onChange(String(next));
  };

  return (
    <div className="flex items-center gap-1.5">
      <div className="flex items-center overflow-hidden rounded-md border">
        <button
          type="button"
          onClick={() => {
            decrement();
          }}
          onMouseUp={onBlur}
          className="text-muted-foreground hover:bg-muted hover:text-foreground flex h-8 w-7 cursor-pointer items-center justify-center border-r transition-colors"
          aria-label={t('common.decrease')}
        >
          <Minus className="h-3 w-3" />
        </button>
        <input
          id={id}
          data-testid={testId}
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          value={value}
          placeholder={placeholder}
          onChange={(e) => {
            const v = e.target.value.replace(/[^0-9]/g, '');
            onChange(v);
          }}
          onBlur={onBlur}
          className="h-8 w-14 bg-transparent text-center text-xs outline-none"
        />
        <button
          type="button"
          onClick={() => {
            increment();
          }}
          onMouseUp={onBlur}
          className="text-muted-foreground hover:bg-muted hover:text-foreground flex h-8 w-7 cursor-pointer items-center justify-center border-l transition-colors"
          aria-label={t('common.increase')}
        >
          <Plus className="h-3 w-3" />
        </button>
      </div>
      {suffix ? <span className="text-muted-foreground text-[11px]">{suffix}</span> : null}
    </div>
  );
}

function SubsectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="border-b pt-3 pb-1">
      <span className="text-muted-foreground text-[10px] font-semibold tracking-wider uppercase">
        {children}
      </span>
    </div>
  );
}

function SectionHint({
  children,
  links,
}: {
  children: React.ReactNode;
  links?: { label: string; href: string }[];
}) {
  return (
    <div className="hidden pt-2 lg:block">
      <p className="text-muted-foreground/70 text-[11px] leading-relaxed">{children}</p>
      {links != null && links.length > 0 ? (
        <div className="mt-2 flex flex-col gap-1">
          {links.map((link) => (
            <a
              key={link.href}
              href={link.href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-[10px] transition-colors"
            >
              <ExternalLink className="h-2.5 w-2.5" />
              {link.label}
            </a>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/* ── Main component ── */

export function SettingsPageClient({
  settings,
  shepHome,
  dbFileSize,
  availableTerminals,
}: SettingsPageClientProps) {
  const { t } = useTranslation('web');
  const { showSaving, showSaved, save } = useSaveIndicator();
  const featureFlags = settings.featureFlags ?? {
    skills: false,
    envDeploy: false,
    debug: false,
    githubImport: false,
    adoptBranch: false,
    gitRebaseSync: false,
    reactFileManager: false,
    inventory: false,
  };

  // Agent state
  const [agentType, setAgentType] = useState(settings.agent.type);

  // Environment state
  const [editor, setEditor] = useState(settings.environment.defaultEditor);
  const [shell, setShell] = useState(settings.environment.shellPreference);
  const [terminal, setTerminal] = useState(
    settings.environment.terminalPreference ?? TerminalType.System
  );

  // Filter to only show installed terminals
  const terminalOptions = availableTerminals
    ? availableTerminals.filter((t) => t.available)
    : [
        {
          id: TerminalType.System,
          name: t('settings.environment.systemTerminal'),
          available: true as const,
        },
      ];

  // Workflow state
  const [openPr, setOpenPr] = useState(settings.workflow.openPrOnImplementationComplete);
  const [pushOnComplete, setPushOnComplete] = useState(
    settings.workflow.approvalGateDefaults.pushOnImplementationComplete
  );
  const [allowPrd, setAllowPrd] = useState(settings.workflow.approvalGateDefaults.allowPrd);
  const [allowPlan, setAllowPlan] = useState(settings.workflow.approvalGateDefaults.allowPlan);
  const [allowMerge, setAllowMerge] = useState(settings.workflow.approvalGateDefaults.allowMerge);
  const [enableEvidence, setEnableEvidence] = useState(settings.workflow.enableEvidence);
  const [commitEvidence, setCommitEvidence] = useState(settings.workflow.commitEvidence);
  const [ciWatchEnabled, setCiWatchEnabled] = useState(settings.workflow.ciWatchEnabled !== false);
  const [hideCiStatus, setHideCiStatus] = useState(settings.workflow.hideCiStatus !== false);
  const [defaultMode, setDefaultMode] = useState(settings.workflow.defaultMode ?? 'Fast');
  // Auto-archive state
  const [autoArchiveEnabled, setAutoArchiveEnabled] = useState(
    (settings.workflow.autoArchiveDelayMinutes ?? 10) > 0
  );
  const [autoArchiveDelay, setAutoArchiveDelay] = useState(
    String(settings.workflow.autoArchiveDelayMinutes ?? 10)
  );
  const [ciMaxFix, setCiMaxFix] = useState(
    settings.workflow.ciMaxFixAttempts != null ? String(settings.workflow.ciMaxFixAttempts) : ''
  );
  const [ciTimeout, setCiTimeout] = useState(
    settings.workflow.ciWatchTimeoutMs != null
      ? String(Math.round(settings.workflow.ciWatchTimeoutMs / 1000))
      : ''
  );
  const [ciLogMax, setCiLogMax] = useState(
    settings.workflow.ciLogMaxChars != null ? String(settings.workflow.ciLogMaxChars) : ''
  );
  const [ciPollInterval, setCiPollInterval] = useState(
    settings.workflow.ciWatchPollIntervalSeconds != null
      ? String(settings.workflow.ciWatchPollIntervalSeconds)
      : ''
  );
  // Feature agent per-stage timeout states (stored in seconds for display, converted to ms on save)
  // Defaults: feature agent stages = 1_800_000 ms (1800s), analyze-repo = 600_000 ms (600s)
  const stageTimeoutsConfig = settings.workflow.stageTimeouts;
  const [analyzeTimeout, setAnalyzeTimeout] = useState(
    String(Math.round((stageTimeoutsConfig?.analyzeMs ?? 1_800_000) / 1000))
  );
  const [requirementsTimeout, setRequirementsTimeout] = useState(
    String(Math.round((stageTimeoutsConfig?.requirementsMs ?? 1_800_000) / 1000))
  );
  const [researchTimeout, setResearchTimeout] = useState(
    String(Math.round((stageTimeoutsConfig?.researchMs ?? 1_800_000) / 1000))
  );
  const [planTimeout, setPlanTimeout] = useState(
    String(Math.round((stageTimeoutsConfig?.planMs ?? 1_800_000) / 1000))
  );
  const [implementTimeout, setImplementTimeout] = useState(
    String(Math.round((stageTimeoutsConfig?.implementMs ?? 1_800_000) / 1000))
  );
  const [fastImplementTimeout, setFastImplementTimeout] = useState(
    String(Math.round((stageTimeoutsConfig?.fastImplementMs ?? 1_800_000) / 1000))
  );
  const [mergeTimeout, setMergeTimeout] = useState(
    String(Math.round((stageTimeoutsConfig?.mergeMs ?? 1_800_000) / 1000))
  );
  // Analyze-repo agent timeout state
  const analyzeRepoConfig = settings.workflow.analyzeRepoTimeouts;
  const [analyzeRepoTimeout, setAnalyzeRepoTimeout] = useState(
    String(Math.round((analyzeRepoConfig?.analyzeMs ?? 600_000) / 1000))
  );

  // Interactive agent state
  const interactiveAgentConfig: InteractiveAgentConfig = settings.interactiveAgent ?? {
    enabled: true,
    autoTimeoutMinutes: 15,
    maxConcurrentSessions: 3,
  };
  const [interactiveEnabled, setInteractiveEnabled] = useState(interactiveAgentConfig.enabled);
  const [interactiveTimeout, setInteractiveTimeout] = useState(
    String(interactiveAgentConfig.autoTimeoutMinutes)
  );
  const [interactiveSessions, setInteractiveSessions] = useState(
    String(interactiveAgentConfig.maxConcurrentSessions)
  );

  // FAB layout state
  const fabLayoutConfig: FabLayoutConfig = settings.fabLayout ?? { swapPosition: false };
  const [fabSwapPosition, setFabSwapPosition] = useState(fabLayoutConfig.swapPosition);

  // Notification state
  const [inApp, setInApp] = useState(settings.notifications.inApp.enabled);
  const [events, setEvents] = useState({ ...settings.notifications.events });

  // Feature flags state
  const [flags, setFlags] = useState<FeatureFlags>({ ...featureFlags });

  // Original CI values for blur comparison
  const originalCiMaxFix =
    settings.workflow.ciMaxFixAttempts != null ? String(settings.workflow.ciMaxFixAttempts) : '';
  const originalCiTimeout =
    settings.workflow.ciWatchTimeoutMs != null
      ? String(Math.round(settings.workflow.ciWatchTimeoutMs / 1000))
      : '';
  const originalCiLogMax =
    settings.workflow.ciLogMaxChars != null ? String(settings.workflow.ciLogMaxChars) : '';
  const originalCiPollInterval =
    settings.workflow.ciWatchPollIntervalSeconds != null
      ? String(settings.workflow.ciWatchPollIntervalSeconds)
      : '';
  const originalAnalyzeTimeout =
    stageTimeoutsConfig?.analyzeMs != null
      ? String(Math.round(stageTimeoutsConfig.analyzeMs / 1000))
      : '';
  const originalRequirementsTimeout =
    stageTimeoutsConfig?.requirementsMs != null
      ? String(Math.round(stageTimeoutsConfig.requirementsMs / 1000))
      : '';
  const originalResearchTimeout =
    stageTimeoutsConfig?.researchMs != null
      ? String(Math.round(stageTimeoutsConfig.researchMs / 1000))
      : '';
  const originalPlanTimeout =
    stageTimeoutsConfig?.planMs != null
      ? String(Math.round(stageTimeoutsConfig.planMs / 1000))
      : '';
  const originalImplementTimeout =
    stageTimeoutsConfig?.implementMs != null
      ? String(Math.round(stageTimeoutsConfig.implementMs / 1000))
      : '';
  const originalFastImplementTimeout =
    stageTimeoutsConfig?.fastImplementMs != null
      ? String(Math.round(stageTimeoutsConfig.fastImplementMs / 1000))
      : '';
  const originalMergeTimeout =
    stageTimeoutsConfig?.mergeMs != null
      ? String(Math.round(stageTimeoutsConfig.mergeMs / 1000))
      : '';
  const originalAnalyzeRepoTimeout =
    analyzeRepoConfig?.analyzeMs != null
      ? String(Math.round(analyzeRepoConfig.analyzeMs / 1000))
      : '';

  function parseOptionalInt(value: string): number | undefined {
    if (value === '') return undefined;
    const n = parseInt(value, 10);
    return Number.isNaN(n) || n <= 0 ? undefined : n;
  }

  function secondsToMs(val: string | undefined): number | undefined {
    if (val === undefined) return undefined;
    const n = parseOptionalInt(val);
    return n != null ? n * 1000 : undefined;
  }

  // Workflow helpers
  function buildWorkflowPayload(
    overrides: {
      openPr?: boolean;
      pushOnComplete?: boolean;
      allowPrd?: boolean;
      allowPlan?: boolean;
      allowMerge?: boolean;
      enableEvidence?: boolean;
      commitEvidence?: boolean;
      ciWatchEnabled?: boolean;
      hideCiStatus?: boolean;
      defaultMode?: string;
      autoArchiveEnabled?: boolean;
      autoArchiveDelay?: string;
      ciMaxFix?: string;
      ciTimeout?: string;
      ciLogMax?: string;
      ciPollInterval?: string;
      analyzeTimeout?: string;
      requirementsTimeout?: string;
      researchTimeout?: string;
      planTimeout?: string;
      implementTimeout?: string;
      fastImplementTimeout?: string;
      mergeTimeout?: string;
      analyzeRepoTimeout?: string;
    } = {}
  ) {
    const timeoutSeconds = parseOptionalInt(overrides.ciTimeout ?? ciTimeout);
    const archiveEnabled = overrides.autoArchiveEnabled ?? autoArchiveEnabled;
    const archiveDelay = parseInt(overrides.autoArchiveDelay ?? autoArchiveDelay, 10);
    return {
      workflow: {
        openPrOnImplementationComplete: overrides.openPr ?? openPr,
        approvalGateDefaults: {
          pushOnImplementationComplete: overrides.pushOnComplete ?? pushOnComplete,
          allowPrd: overrides.allowPrd ?? allowPrd,
          allowPlan: overrides.allowPlan ?? allowPlan,
          allowMerge: overrides.allowMerge ?? allowMerge,
        },
        enableEvidence: overrides.enableEvidence ?? enableEvidence,
        commitEvidence: overrides.commitEvidence ?? commitEvidence,
        ciWatchEnabled: overrides.ciWatchEnabled ?? ciWatchEnabled,
        hideCiStatus: overrides.hideCiStatus ?? hideCiStatus,
        defaultMode: overrides.defaultMode ?? defaultMode,
        autoArchiveDelayMinutes: archiveEnabled
          ? Number.isNaN(archiveDelay) || archiveDelay < 1
            ? 10
            : archiveDelay
          : 0,
        ciMaxFixAttempts: parseOptionalInt(overrides.ciMaxFix ?? ciMaxFix),
        ciWatchTimeoutMs: timeoutSeconds != null ? timeoutSeconds * 1000 : undefined,
        ciLogMaxChars: parseOptionalInt(overrides.ciLogMax ?? ciLogMax),
        ciWatchPollIntervalSeconds: parseOptionalInt(overrides.ciPollInterval ?? ciPollInterval),
        stageTimeouts: {
          analyzeMs: secondsToMs(overrides.analyzeTimeout ?? analyzeTimeout),
          requirementsMs: secondsToMs(overrides.requirementsTimeout ?? requirementsTimeout),
          researchMs: secondsToMs(overrides.researchTimeout ?? researchTimeout),
          planMs: secondsToMs(overrides.planTimeout ?? planTimeout),
          implementMs: secondsToMs(overrides.implementTimeout ?? implementTimeout),
          fastImplementMs: secondsToMs(overrides.fastImplementTimeout ?? fastImplementTimeout),
          mergeMs: secondsToMs(overrides.mergeTimeout ?? mergeTimeout),
        },
        analyzeRepoTimeouts: {
          analyzeMs: secondsToMs(overrides.analyzeRepoTimeout ?? analyzeRepoTimeout),
        },
      },
    };
  }

  // Notification helpers
  function buildNotificationPayload(
    overrides: {
      inApp?: boolean;
      events?: NotificationPreferences['events'];
    } = {}
  ) {
    return {
      notifications: {
        inApp: { enabled: overrides.inApp ?? inApp },
        events: overrides.events ?? events,
      },
    };
  }

  const [activeSection, setActiveSection] = useState<string>('agent');

  // Track which section is in view via IntersectionObserver
  useEffect(() => {
    const els = SECTIONS.map((s) => document.getElementById(`section-${s.id}`)).filter(
      Boolean
    ) as HTMLElement[];
    if (els.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActiveSection(entry.target.id.replace('section-', ''));
          }
        }
      },
      { rootMargin: '-65px 0px -60% 0px', threshold: 0 }
    );

    for (const el of els) observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const scrollToSection = useCallback((id: string) => {
    const el = document.getElementById(`section-${id}`);
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    // Flash highlight
    el.style.animation = 'none';
    // Force reflow
    void el.offsetHeight;
    el.style.animation = 'section-flash 1s ease-out';
  }, []);

  return (
    <div data-testid="settings-page-client" className="max-w-5xl">
      {/* Sticky header — title + save indicator + TOC in one row */}
      <div className="bg-background/95 supports-backdrop-filter:bg-background/80 sticky top-0 z-10 grid grid-cols-1 gap-x-5 pt-6 pb-4 backdrop-blur lg:grid-cols-[1fr_280px]">
        <div className="flex items-center gap-2">
          <Settings2 className="text-muted-foreground h-4 w-4" />
          <h1 className="text-sm font-bold tracking-tight">{t('settings.title')}</h1>
          <span className="relative h-4 w-16">
            <span
              className={cn(
                'text-muted-foreground absolute inset-0 flex items-center text-xs transition-opacity duration-300',
                showSaving ? 'opacity-100' : 'opacity-0'
              )}
            >
              {t('settings.saving')}
            </span>
            <span
              className={cn(
                'absolute inset-0 flex items-center gap-1 text-xs text-green-600 transition-opacity duration-300',
                showSaved && !showSaving ? 'opacity-100' : 'opacity-0'
              )}
            >
              <Check className="h-3 w-3" />
              {t('settings.saved')}
            </span>
          </span>
          <nav className="ml-auto flex items-center gap-0.5">
            {SECTIONS.map((s) => {
              const SectionIcon = s.icon;
              const isActive = activeSection === s.id;
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => scrollToSection(s.id)}
                  className={cn(
                    'flex cursor-pointer items-center gap-1 rounded-md px-1.5 py-1 text-[11px] transition-all',
                    isActive
                      ? 'bg-accent text-foreground font-medium'
                      : 'text-muted-foreground/60 hover:text-foreground hover:bg-accent/50'
                  )}
                >
                  <SectionIcon className="h-3 w-3" />
                  <span className="hidden sm:inline">{t(s.labelKey)}</span>
                </button>
              );
            })}
          </nav>
        </div>
      </div>

      <div className="flex flex-col gap-3">
        {/* ── Language ── */}
        <div
          id="section-language"
          className="grid scroll-mt-18 grid-cols-1 gap-x-5 rounded-lg lg:grid-cols-[1fr_280px]"
        >
          <LanguageSettingsSection
            language={settings.user?.preferredLanguage ?? Language.English}
          />
        </div>

        {/* ── Agent ── */}
        <div
          id="section-agent"
          className="grid scroll-mt-18 grid-cols-1 gap-x-5 rounded-lg lg:grid-cols-[1fr_280px]"
        >
          <SettingsSection
            icon={Bot}
            title={t('settings.agent.sectionTitle')}
            description={t('settings.agent.sectionDescription')}
            testId="agent-settings-section"
          >
            <SettingsRow
              label={t('settings.agent.agentAndModel')}
              description={t('settings.agent.agentAndModelDescription')}
              htmlFor="agent-model-picker"
            >
              <AgentModelPicker
                initialAgentType={agentType}
                initialModel={settings.models.default}
                mode="settings"
                onAgentModelChange={(newAgent) => setAgentType(newAgent as AgentType)}
                className="w-55"
              />
            </SettingsRow>
          </SettingsSection>
          <SectionHint
            links={[
              {
                label: t('settings.agent.links.agentSystem'),
                href: 'https://github.com/shep-ai/shep/blob/main/docs/architecture/agent-system.md',
              },
              {
                label: t('settings.agent.links.addingAgents'),
                href: 'https://github.com/shep-ai/shep/blob/main/docs/development/adding-agents.md',
              },
              {
                label: t('settings.agent.links.configurationGuide'),
                href: 'https://github.com/shep-ai/shep/blob/main/docs/guides/configuration.md',
              },
            ]}
          >
            {t('settings.agent.hint')}
          </SectionHint>
        </div>

        {/* ── Environment ── */}
        <div
          id="section-environment"
          className="grid scroll-mt-18 grid-cols-1 gap-x-5 rounded-lg lg:grid-cols-[1fr_280px]"
        >
          <SettingsSection
            icon={Terminal}
            title={t('settings.environment.sectionTitle')}
            description={t('settings.environment.sectionDescription')}
            testId="environment-settings-section"
          >
            <SettingsRow
              label={t('settings.environment.defaultEditor')}
              description={t('settings.environment.defaultEditorDescription')}
              htmlFor="default-editor"
            >
              <Select
                value={editor}
                onValueChange={(v) => {
                  setEditor(v as EditorType);
                  save({
                    environment: {
                      defaultEditor: v as EditorType,
                      shellPreference: shell,
                      terminalPreference: terminal,
                    },
                  });
                }}
              >
                <SelectTrigger
                  id="default-editor"
                  data-testid="editor-select"
                  className="w-55 cursor-pointer text-xs"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {EDITOR_OPTIONS.map((opt) => {
                    const Icon = getEditorTypeIcon(opt.value);
                    return (
                      <SelectItem key={opt.value} value={opt.value}>
                        <span className="flex items-center gap-2 text-xs">
                          <Icon className="h-4 w-4 shrink-0" />
                          {opt.label}
                        </span>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </SettingsRow>
            <SettingsRow
              label={t('settings.environment.shell')}
              description={t('settings.environment.shellDescription')}
              htmlFor="shell-preference"
            >
              <Select
                value={shell}
                onValueChange={(v) => {
                  setShell(v);
                  save({
                    environment: {
                      defaultEditor: editor,
                      shellPreference: v,
                      terminalPreference: terminal,
                    },
                  });
                }}
              >
                <SelectTrigger
                  id="shell-preference"
                  data-testid="shell-select"
                  className="w-55 cursor-pointer text-xs"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SHELL_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </SettingsRow>
            <SettingsRow
              label={t('settings.environment.terminal')}
              description={t('settings.environment.terminalDescription')}
              htmlFor="terminal-preference"
            >
              <Select
                value={terminal}
                onValueChange={(v) => {
                  setTerminal(v as TerminalType);
                  save({
                    environment: {
                      defaultEditor: editor,
                      shellPreference: shell,
                      terminalPreference: v as TerminalType,
                    },
                  });
                }}
              >
                <SelectTrigger
                  id="terminal-preference"
                  data-testid="terminal-select"
                  className="w-55 cursor-pointer text-xs"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {terminalOptions.map((opt) => (
                    <SelectItem key={opt.id} value={opt.id}>
                      {opt.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </SettingsRow>
          </SettingsSection>
          <SectionHint
            links={[
              {
                label: t('settings.environment.links.configurationGuide'),
                href: 'https://github.com/shep-ai/shep/blob/main/docs/guides/configuration.md',
              },
            ]}
          >
            {t('settings.environment.hint')}
          </SectionHint>
        </div>

        {/* ── Workflow ── */}
        <div
          id="section-workflow"
          className="grid scroll-mt-18 grid-cols-1 gap-x-5 rounded-lg lg:grid-cols-[1fr_280px]"
        >
          <SettingsSection
            icon={GitBranch}
            title={t('settings.workflow.title')}
            description={t('settings.workflow.sectionDescription')}
            testId="workflow-settings-section"
          >
            <SettingsRow
              label={t('settings.workflow.defaultMode')}
              description={t('settings.workflow.defaultModeDescription')}
            >
              <Select
                value={defaultMode}
                onValueChange={(v) => {
                  setDefaultMode(v);
                  save(buildWorkflowPayload({ defaultMode: v }));
                }}
              >
                <SelectTrigger
                  id="default-mode"
                  data-testid="default-mode-select"
                  className="w-55 cursor-pointer text-xs"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Regular">{t('settings.workflow.modeRegular')}</SelectItem>
                  <SelectItem value="Fast">{t('settings.workflow.modeFast')}</SelectItem>
                  <SelectItem value="Exploration">
                    {t('settings.workflow.modeExploration')}
                  </SelectItem>
                </SelectContent>
              </Select>
            </SettingsRow>
            <SubsectionLabel>{t('settings.workflow.subsections.approve')}</SubsectionLabel>
            <SwitchRow
              label={t('settings.workflow.autoApprovePrd')}
              description={t('settings.workflow.autoApprovePrdDescription')}
              id="allow-prd"
              testId="switch-allow-prd"
              checked={allowPrd}
              onChange={(v) => {
                setAllowPrd(v);
                save(buildWorkflowPayload({ allowPrd: v }));
              }}
            />
            <SwitchRow
              label={t('settings.workflow.autoApprovePlan')}
              description={t('settings.workflow.autoApprovePlanDescription')}
              id="allow-plan"
              testId="switch-allow-plan"
              checked={allowPlan}
              onChange={(v) => {
                setAllowPlan(v);
                save(buildWorkflowPayload({ allowPlan: v }));
              }}
            />
            <SwitchRow
              label={t('settings.workflow.autoApproveMerge')}
              description={t('settings.workflow.autoApproveMergeDescription')}
              id="allow-merge"
              testId="switch-allow-merge"
              checked={allowMerge}
              onChange={(v) => {
                setAllowMerge(v);
                save(buildWorkflowPayload({ allowMerge: v }));
              }}
            />
            <SubsectionLabel>{t('settings.workflow.subsections.evidence')}</SubsectionLabel>
            <SwitchRow
              label={t('settings.workflow.collectEvidence')}
              description={t('settings.workflow.collectEvidenceDescription')}
              id="enable-evidence"
              testId="switch-enable-evidence"
              checked={enableEvidence}
              onChange={(v) => {
                setEnableEvidence(v);
                if (!v) {
                  setCommitEvidence(false);
                  save(buildWorkflowPayload({ enableEvidence: v, commitEvidence: false }));
                } else {
                  save(buildWorkflowPayload({ enableEvidence: v }));
                }
              }}
            />
            <SwitchRow
              label={t('settings.workflow.addEvidenceToPr')}
              description={t('settings.workflow.addEvidenceToPrDescription')}
              id="commit-evidence"
              testId="switch-commit-evidence"
              checked={commitEvidence}
              disabled={!enableEvidence || !openPr}
              onChange={(v) => {
                setCommitEvidence(v);
                save(buildWorkflowPayload({ commitEvidence: v }));
              }}
            />
            <SubsectionLabel>{t('settings.workflow.subsections.git')}</SubsectionLabel>
            <SwitchRow
              label={t('settings.workflow.pushOnComplete')}
              description={t('settings.workflow.pushOnCompleteDescription')}
              id="push-on-complete"
              testId="switch-push-on-complete"
              checked={pushOnComplete}
              onChange={(v) => {
                setPushOnComplete(v);
                save(buildWorkflowPayload({ pushOnComplete: v }));
              }}
            />
            <SwitchRow
              label={t('settings.workflow.openPrOnComplete')}
              description={t('settings.workflow.openPrOnCompleteDescription')}
              id="open-pr"
              testId="switch-open-pr"
              checked={openPr}
              onChange={(v) => {
                setOpenPr(v);
                if (!v) {
                  setCommitEvidence(false);
                  save(buildWorkflowPayload({ openPr: v, commitEvidence: false }));
                } else {
                  save(buildWorkflowPayload({ openPr: v }));
                }
              }}
            />
            <SwitchRow
              label={t('settings.workflow.watchCiAfterPush')}
              description={t('settings.workflow.watchCiAfterPushDescription')}
              id="ci-watch-enabled"
              testId="switch-ci-watch-enabled"
              checked={ciWatchEnabled}
              onChange={(v) => {
                setCiWatchEnabled(v);
                save(buildWorkflowPayload({ ciWatchEnabled: v }));
              }}
            />
            <SubsectionLabel>Archive</SubsectionLabel>
            <SwitchRow
              label="Auto-archive completed"
              description="Automatically archive features after they reach the completed state"
              id="auto-archive-enabled"
              testId="switch-auto-archive-enabled"
              checked={autoArchiveEnabled}
              onChange={(v) => {
                setAutoArchiveEnabled(v);
                save(buildWorkflowPayload({ autoArchiveEnabled: v }));
              }}
            />
            <SettingsRow
              label="Archive delay"
              description="Minutes to wait after completion before archiving (1–1440)"
              htmlFor="auto-archive-delay"
            >
              <NumberStepper
                id="auto-archive-delay"
                testId="input-auto-archive-delay"
                value={autoArchiveDelay}
                placeholder="10"
                min={1}
                max={1440}
                suffix="min"
                onChange={(v) => {
                  setAutoArchiveDelay(v);
                }}
                onBlur={() => {
                  if (!autoArchiveEnabled) return;
                  const n = parseInt(autoArchiveDelay, 10);
                  const clamped = Number.isNaN(n) ? 10 : Math.min(1440, Math.max(1, n));
                  setAutoArchiveDelay(String(clamped));
                  save(buildWorkflowPayload({ autoArchiveDelay: String(clamped) }));
                }}
              />
            </SettingsRow>
          </SettingsSection>
          <SectionHint
            links={[
              {
                label: t('settings.workflow.links.approvalGates'),
                href: 'https://github.com/shep-ai/shep/blob/main/specs/016-hitl-approval-gates/spec.yaml',
              },
              {
                label: t('settings.workflow.links.pushAndPrFlags'),
                href: 'https://github.com/shep-ai/shep/blob/main/specs/037-feature-pr-push-flags/spec.yaml',
              },
            ]}
          >
            {t('settings.workflow.hint')}
          </SectionHint>
        </div>

        {/* ── CI ── */}
        <div
          id="section-ci"
          className="grid scroll-mt-18 grid-cols-1 gap-x-5 rounded-lg lg:grid-cols-[1fr_280px]"
        >
          <SettingsSection
            icon={Activity}
            title={t('settings.ci.title')}
            description={t('settings.ci.description')}
            testId="ci-settings-section"
          >
            <SettingsRow
              label={t('settings.ci.maxFixAttempts')}
              description={t('settings.ci.maxFixAttemptsDescription')}
              htmlFor="ci-max-fix"
            >
              <NumberStepper
                id="ci-max-fix"
                testId="ci-max-fix-input"
                placeholder="3"
                value={ciMaxFix}
                onChange={setCiMaxFix}
                onBlur={() => {
                  if (ciMaxFix !== originalCiMaxFix) save(buildWorkflowPayload({ ciMaxFix }));
                }}
                min={1}
                max={10}
              />
            </SettingsRow>
            <SettingsRow
              label={t('settings.ci.watchTimeout')}
              description={t('settings.ci.watchTimeoutDescription')}
              htmlFor="ci-timeout"
            >
              <NumberStepper
                id="ci-timeout"
                testId="ci-timeout-input"
                placeholder="300"
                value={ciTimeout}
                onChange={setCiTimeout}
                onBlur={() => {
                  if (ciTimeout !== originalCiTimeout) save(buildWorkflowPayload({ ciTimeout }));
                }}
                min={30}
                step={30}
                suffix="sec"
              />
            </SettingsRow>
            <SettingsRow
              label={t('settings.ci.maxLogSize')}
              description={t('settings.ci.maxLogSizeDescription')}
              htmlFor="ci-log-max"
            >
              <NumberStepper
                id="ci-log-max"
                testId="ci-log-max-input"
                placeholder="50000"
                value={ciLogMax}
                onChange={setCiLogMax}
                onBlur={() => {
                  if (ciLogMax !== originalCiLogMax) save(buildWorkflowPayload({ ciLogMax }));
                }}
                min={1000}
                step={5000}
                suffix="chars"
              />
            </SettingsRow>
            <SettingsRow
              label={t('settings.ci.pollInterval')}
              description={t('settings.ci.pollIntervalDescription')}
              htmlFor="ci-poll-interval"
            >
              <NumberStepper
                id="ci-poll-interval"
                testId="ci-poll-interval-input"
                placeholder="30"
                value={ciPollInterval}
                onChange={setCiPollInterval}
                onBlur={() => {
                  if (ciPollInterval !== originalCiPollInterval)
                    save(buildWorkflowPayload({ ciPollInterval }));
                }}
                min={5}
                step={5}
                suffix="sec"
              />
            </SettingsRow>
            <SwitchRow
              label={t('settings.ci.hideCiStatus')}
              description={t('settings.ci.hideCiStatusDescription')}
              id="hide-ci-status"
              testId="switch-hide-ci-status"
              checked={hideCiStatus}
              onChange={(v) => {
                setHideCiStatus(v);
                save(buildWorkflowPayload({ hideCiStatus: v }));
              }}
            />
          </SettingsSection>
          <SectionHint
            links={[
              {
                label: t('settings.ci.links.cicdPipeline'),
                href: 'https://github.com/shep-ai/shep/blob/main/docs/development/cicd.md',
              },
              {
                label: t('settings.ci.links.ciSecurityGates'),
                href: 'https://github.com/shep-ai/shep/blob/main/specs/003-cicd-security-gates/spec.md',
              },
            ]}
          >
            {t('settings.ci.hint')}
          </SectionHint>
        </div>

        {/* ── Stage Timeouts ── */}
        <div
          id="section-stage-timeouts"
          className="grid scroll-mt-18 grid-cols-1 gap-x-5 rounded-lg lg:grid-cols-[1fr_280px]"
        >
          <SettingsSection
            icon={Timer}
            title={t('settings.stageTimeouts.title')}
            description={t('settings.stageTimeouts.description')}
            testId="stage-timeouts-settings-section"
          >
            <SubsectionLabel>
              {t('settings.stageTimeouts.subsections.featureAgent')}
            </SubsectionLabel>
            <SettingsRow
              label={t('settings.stageTimeouts.analyze')}
              description={t('settings.stageTimeouts.analyzeDescription')}
              htmlFor="timeout-analyze"
            >
              <TimeoutSlider
                id="timeout-analyze"
                testId="timeout-analyze-input"
                value={analyzeTimeout}
                onChange={setAnalyzeTimeout}
                onBlur={() => {
                  if (analyzeTimeout !== originalAnalyzeTimeout)
                    save(buildWorkflowPayload({ analyzeTimeout }));
                }}
                defaultSeconds={1800}
              />
            </SettingsRow>
            <SettingsRow
              label={t('settings.stageTimeouts.requirements')}
              description={t('settings.stageTimeouts.requirementsDescription')}
              htmlFor="timeout-requirements"
            >
              <TimeoutSlider
                id="timeout-requirements"
                testId="timeout-requirements-input"
                value={requirementsTimeout}
                onChange={setRequirementsTimeout}
                onBlur={() => {
                  if (requirementsTimeout !== originalRequirementsTimeout)
                    save(buildWorkflowPayload({ requirementsTimeout }));
                }}
                defaultSeconds={1800}
              />
            </SettingsRow>
            <SettingsRow
              label={t('settings.stageTimeouts.research')}
              description={t('settings.stageTimeouts.researchDescription')}
              htmlFor="timeout-research"
            >
              <TimeoutSlider
                id="timeout-research"
                testId="timeout-research-input"
                value={researchTimeout}
                onChange={setResearchTimeout}
                onBlur={() => {
                  if (researchTimeout !== originalResearchTimeout)
                    save(buildWorkflowPayload({ researchTimeout }));
                }}
                defaultSeconds={1800}
              />
            </SettingsRow>
            <SettingsRow
              label={t('settings.stageTimeouts.plan')}
              description={t('settings.stageTimeouts.planDescription')}
              htmlFor="timeout-plan"
            >
              <TimeoutSlider
                id="timeout-plan"
                testId="timeout-plan-input"
                value={planTimeout}
                onChange={setPlanTimeout}
                onBlur={() => {
                  if (planTimeout !== originalPlanTimeout)
                    save(buildWorkflowPayload({ planTimeout }));
                }}
                defaultSeconds={1800}
              />
            </SettingsRow>
            <SettingsRow
              label={t('settings.stageTimeouts.implement')}
              description={t('settings.stageTimeouts.implementDescription')}
              htmlFor="timeout-implement"
            >
              <TimeoutSlider
                id="timeout-implement"
                testId="timeout-implement-input"
                value={implementTimeout}
                onChange={setImplementTimeout}
                onBlur={() => {
                  if (implementTimeout !== originalImplementTimeout)
                    save(buildWorkflowPayload({ implementTimeout }));
                }}
                defaultSeconds={1800}
              />
            </SettingsRow>
            <SettingsRow
              label={t('settings.stageTimeouts.fastImplement')}
              description={t('settings.stageTimeouts.fastImplementDescription')}
              htmlFor="timeout-fast-implement"
            >
              <TimeoutSlider
                id="timeout-fast-implement"
                testId="timeout-fast-implement-input"
                value={fastImplementTimeout}
                onChange={setFastImplementTimeout}
                onBlur={() => {
                  if (fastImplementTimeout !== originalFastImplementTimeout)
                    save(buildWorkflowPayload({ fastImplementTimeout }));
                }}
                defaultSeconds={1800}
              />
            </SettingsRow>
            <SettingsRow
              label={t('settings.stageTimeouts.merge')}
              description={t('settings.stageTimeouts.mergeDescription')}
              htmlFor="timeout-merge"
            >
              <TimeoutSlider
                id="timeout-merge"
                testId="timeout-merge-input"
                value={mergeTimeout}
                onChange={setMergeTimeout}
                onBlur={() => {
                  if (mergeTimeout !== originalMergeTimeout)
                    save(buildWorkflowPayload({ mergeTimeout }));
                }}
                defaultSeconds={1800}
              />
            </SettingsRow>
            <SubsectionLabel>
              {t('settings.stageTimeouts.subsections.analyzeRepoAgent')}
            </SubsectionLabel>
            <SettingsRow
              label={t('settings.stageTimeouts.analyze')}
              description={t('settings.stageTimeouts.analyzeDescription')}
              htmlFor="timeout-analyze-repo"
            >
              <TimeoutSlider
                id="timeout-analyze-repo"
                testId="timeout-analyze-repo-input"
                value={analyzeRepoTimeout}
                onChange={setAnalyzeRepoTimeout}
                onBlur={() => {
                  if (analyzeRepoTimeout !== originalAnalyzeRepoTimeout)
                    save(buildWorkflowPayload({ analyzeRepoTimeout }));
                }}
                defaultSeconds={600}
              />
            </SettingsRow>
          </SettingsSection>
          <SectionHint>{t('settings.stageTimeouts.hint')}</SectionHint>
        </div>

        {/* ── Notifications ── */}
        <div
          id="section-notifications"
          className="grid scroll-mt-18 grid-cols-1 gap-x-5 rounded-lg lg:grid-cols-[1fr_280px]"
        >
          <SettingsSection
            icon={Bell}
            title={t('settings.notifications.title')}
            description={t('settings.notifications.sectionDescription')}
            testId="notification-settings-section"
          >
            <SubsectionLabel>{t('settings.notifications.channels')}</SubsectionLabel>
            <SwitchRow
              label={t('settings.notifications.inAppLabel')}
              description={t('settings.notifications.inAppDescription')}
              id="notif-in-app"
              testId="switch-in-app"
              checked={inApp}
              onChange={(v) => {
                setInApp(v);
                save(buildNotificationPayload({ inApp: v }));
              }}
            />

            <SubsectionLabel>{t('settings.notifications.subsections.agentEvents')}</SubsectionLabel>
            <SwitchRow
              label={t('settings.notifications.events.agentStarted')}
              id="notif-event-agentStarted"
              testId="switch-event-agentStarted"
              checked={events.agentStarted}
              onChange={(v) => {
                const newEvents = { ...events, agentStarted: v };
                setEvents(newEvents);
                save(buildNotificationPayload({ events: newEvents }));
              }}
            />
            <SwitchRow
              label={t('settings.notifications.events.phaseCompleted')}
              id="notif-event-phaseCompleted"
              testId="switch-event-phaseCompleted"
              checked={events.phaseCompleted}
              onChange={(v) => {
                const newEvents = { ...events, phaseCompleted: v };
                setEvents(newEvents);
                save(buildNotificationPayload({ events: newEvents }));
              }}
            />
            <SwitchRow
              label={t('settings.notifications.events.waitingApproval')}
              id="notif-event-waitingApproval"
              testId="switch-event-waitingApproval"
              checked={events.waitingApproval}
              onChange={(v) => {
                const newEvents = { ...events, waitingApproval: v };
                setEvents(newEvents);
                save(buildNotificationPayload({ events: newEvents }));
              }}
            />
            <SwitchRow
              label={t('settings.notifications.events.agentCompleted')}
              id="notif-event-agentCompleted"
              testId="switch-event-agentCompleted"
              checked={events.agentCompleted}
              onChange={(v) => {
                const newEvents = { ...events, agentCompleted: v };
                setEvents(newEvents);
                save(buildNotificationPayload({ events: newEvents }));
              }}
            />
            <SwitchRow
              label={t('settings.notifications.events.agentFailed')}
              id="notif-event-agentFailed"
              testId="switch-event-agentFailed"
              checked={events.agentFailed}
              onChange={(v) => {
                const newEvents = { ...events, agentFailed: v };
                setEvents(newEvents);
                save(buildNotificationPayload({ events: newEvents }));
              }}
            />

            <SubsectionLabel>
              {t('settings.notifications.subsections.pullRequestEvents')}
            </SubsectionLabel>
            <SwitchRow
              label={t('settings.notifications.events.prMerged')}
              id="notif-event-prMerged"
              testId="switch-event-prMerged"
              checked={events.prMerged}
              onChange={(v) => {
                const newEvents = { ...events, prMerged: v };
                setEvents(newEvents);
                save(buildNotificationPayload({ events: newEvents }));
              }}
            />
            <SwitchRow
              label={t('settings.notifications.events.prClosed')}
              id="notif-event-prClosed"
              testId="switch-event-prClosed"
              checked={events.prClosed}
              onChange={(v) => {
                const newEvents = { ...events, prClosed: v };
                setEvents(newEvents);
                save(buildNotificationPayload({ events: newEvents }));
              }}
            />
            <SwitchRow
              label={t('settings.notifications.events.prChecksPassed')}
              id="notif-event-prChecksPassed"
              testId="switch-event-prChecksPassed"
              checked={events.prChecksPassed}
              onChange={(v) => {
                const newEvents = { ...events, prChecksPassed: v };
                setEvents(newEvents);
                save(buildNotificationPayload({ events: newEvents }));
              }}
            />
            <SwitchRow
              label={t('settings.notifications.events.prChecksFailed')}
              id="notif-event-prChecksFailed"
              testId="switch-event-prChecksFailed"
              checked={events.prChecksFailed}
              onChange={(v) => {
                const newEvents = { ...events, prChecksFailed: v };
                setEvents(newEvents);
                save(buildNotificationPayload({ events: newEvents }));
              }}
            />
            <SwitchRow
              label={t('settings.notifications.events.prBlocked')}
              id="notif-event-prBlocked"
              testId="switch-event-prBlocked"
              checked={events.prBlocked}
              onChange={(v) => {
                const newEvents = { ...events, prBlocked: v };
                setEvents(newEvents);
                save(buildNotificationPayload({ events: newEvents }));
              }}
            />
            <SwitchRow
              label={t('settings.notifications.events.mergeReviewReady')}
              id="notif-event-mergeReviewReady"
              testId="switch-event-mergeReviewReady"
              checked={events.mergeReviewReady}
              onChange={(v) => {
                const newEvents = { ...events, mergeReviewReady: v };
                setEvents(newEvents);
                save(buildNotificationPayload({ events: newEvents }));
              }}
            />
          </SettingsSection>
          <SectionHint
            links={[
              {
                label: t('settings.notifications.links.notificationSystem'),
                href: 'https://github.com/shep-ai/shep/blob/main/specs/021-agent-notifications/spec.yaml',
              },
            ]}
          >
            {t('settings.notifications.hint')}
          </SectionHint>
        </div>

        {/* ── Feature Flags ── */}
        <div
          id="section-feature-flags"
          className="grid scroll-mt-18 grid-cols-1 gap-x-5 rounded-lg lg:grid-cols-[1fr_280px]"
        >
          <SettingsSection
            icon={Flag}
            title={t('settings.featureFlags.title')}
            description={t('settings.featureFlags.sectionDescription')}
            badge={t('settings.featureFlags.badge')}
            testId="feature-flags-settings-section"
          >
            <SwitchRow
              label={t('settings.featureFlags.skills')}
              description={t('settings.featureFlags.skillsDescription')}
              id="flag-skills"
              testId="switch-flag-skills"
              checked={flags.skills}
              onChange={(v) => {
                const newFlags = { ...flags, skills: v };
                setFlags(newFlags);
                save({ featureFlags: newFlags });
              }}
            />
            <SwitchRow
              label={t('settings.featureFlags.deployments')}
              description={t('settings.featureFlags.deploymentsDescription')}
              id="flag-envDeploy"
              testId="switch-flag-envDeploy"
              checked={flags.envDeploy}
              onChange={(v) => {
                const newFlags = { ...flags, envDeploy: v };
                setFlags(newFlags);
                save({ featureFlags: newFlags });
              }}
            />
            <SwitchRow
              label={t('settings.featureFlags.debug')}
              description={t('settings.featureFlags.debugDescription')}
              id="flag-debug"
              testId="switch-flag-debug"
              checked={flags.debug}
              onChange={(v) => {
                const newFlags = { ...flags, debug: v };
                setFlags(newFlags);
                save({ featureFlags: newFlags });
              }}
            />
            <SwitchRow
              label={t('settings.featureFlags.githubImport')}
              description={t('settings.featureFlags.githubImportDescription')}
              id="flag-githubImport"
              testId="switch-flag-githubImport"
              checked={flags.githubImport}
              onChange={(v) => {
                const newFlags = { ...flags, githubImport: v };
                setFlags(newFlags);
                save({ featureFlags: newFlags });
              }}
            />
            <SwitchRow
              label={t('settings.featureFlags.adoptBranch')}
              description={t('settings.featureFlags.adoptBranchDescription')}
              id="flag-adoptBranch"
              testId="switch-flag-adoptBranch"
              checked={flags.adoptBranch}
              onChange={(v) => {
                const newFlags = { ...flags, adoptBranch: v };
                setFlags(newFlags);
                save({ featureFlags: newFlags });
              }}
            />
            <SwitchRow
              label={t('settings.featureFlags.gitRebaseSync')}
              description={t('settings.featureFlags.gitRebaseSyncDescription')}
              id="flag-gitRebaseSync"
              testId="switch-flag-gitRebaseSync"
              checked={flags.gitRebaseSync}
              onChange={(v) => {
                const newFlags = { ...flags, gitRebaseSync: v };
                setFlags(newFlags);
                save({ featureFlags: newFlags });
              }}
            />
            <SwitchRow
              label={t('settings.featureFlags.reactFileManager')}
              description={t('settings.featureFlags.reactFileManagerDescription')}
              id="flag-reactFileManager"
              testId="switch-flag-reactFileManager"
              checked={flags.reactFileManager}
              onChange={(v) => {
                const newFlags = { ...flags, reactFileManager: v };
                setFlags(newFlags);
                save({ featureFlags: newFlags });
              }}
            />
            <SwitchRow
              label={t('settings.featureFlags.inventory')}
              description={t('settings.featureFlags.inventoryDescription')}
              id="flag-inventory"
              testId="switch-flag-inventory"
              checked={flags.inventory}
              onChange={(v) => {
                const newFlags = { ...flags, inventory: v };
                setFlags(newFlags);
                save({ featureFlags: newFlags });
              }}
            />
          </SettingsSection>
          <SectionHint>{t('settings.featureFlags.hint')}</SectionHint>
        </div>

        {/* ── Interactive Agent ── */}
        <div
          id="section-interactive-agent"
          className="grid scroll-mt-18 grid-cols-1 gap-x-5 rounded-lg lg:grid-cols-[1fr_280px]"
        >
          <SettingsSection
            icon={MessageSquare}
            title={t('settings.interactiveAgent.title')}
            description={t('settings.interactiveAgent.description')}
            testId="interactive-agent-settings-section"
          >
            <SwitchRow
              label={t('settings.interactiveAgent.enableChatTab')}
              description={t('settings.interactiveAgent.enableChatTabDescription')}
              id="interactive-agent-enabled"
              testId="switch-interactive-agent-enabled"
              checked={interactiveEnabled}
              onChange={(v) => {
                setInteractiveEnabled(v);
                save({
                  interactiveAgent: {
                    enabled: v,
                    autoTimeoutMinutes: parseInt(interactiveTimeout, 10) || 15,
                    maxConcurrentSessions: parseInt(interactiveSessions, 10) || 3,
                  },
                });
              }}
            />
            <SettingsRow
              label={t('settings.interactiveAgent.autoTimeout')}
              description={t('settings.interactiveAgent.autoTimeoutDescription')}
              htmlFor="interactive-agent-timeout"
            >
              <NumberStepper
                id="interactive-agent-timeout"
                testId="input-interactive-agent-timeout"
                value={interactiveTimeout}
                placeholder="15"
                min={1}
                max={120}
                suffix="min"
                onChange={setInteractiveTimeout}
                onBlur={() => {
                  const n = parseInt(interactiveTimeout, 10);
                  const clamped = Number.isNaN(n) ? 15 : Math.min(120, Math.max(1, n));
                  const clamped_str = String(clamped);
                  setInteractiveTimeout(clamped_str);
                  save({
                    interactiveAgent: {
                      enabled: interactiveEnabled,
                      autoTimeoutMinutes: clamped,
                      maxConcurrentSessions: parseInt(interactiveSessions, 10) || 3,
                    },
                  });
                }}
              />
            </SettingsRow>
            <SettingsRow
              label={t('settings.interactiveAgent.maxConcurrentSessions')}
              description={t('settings.interactiveAgent.maxConcurrentSessionsDescription')}
              htmlFor="interactive-agent-sessions"
            >
              <NumberStepper
                id="interactive-agent-sessions"
                testId="input-interactive-agent-sessions"
                value={interactiveSessions}
                placeholder="3"
                min={1}
                max={10}
                onChange={setInteractiveSessions}
                onBlur={() => {
                  const n = parseInt(interactiveSessions, 10);
                  const clamped = Number.isNaN(n) ? 3 : Math.min(10, Math.max(1, n));
                  const clamped_str = String(clamped);
                  setInteractiveSessions(clamped_str);
                  save({
                    interactiveAgent: {
                      enabled: interactiveEnabled,
                      autoTimeoutMinutes: parseInt(interactiveTimeout, 10) || 15,
                      maxConcurrentSessions: clamped,
                    },
                  });
                }}
              />
            </SettingsRow>
          </SettingsSection>
          <SectionHint>{t('settings.interactiveAgent.hint')}</SectionHint>
        </div>

        {/* ── FAB Layout ── */}
        <div
          id="section-fab-layout"
          className="grid scroll-mt-18 grid-cols-1 gap-x-5 rounded-lg lg:grid-cols-[1fr_280px]"
        >
          <SettingsSection
            icon={LayoutGrid}
            title={t('settings.fabLayout.title')}
            description={t('settings.fabLayout.description')}
            testId="fab-layout-settings-section"
          >
            <SwitchRow
              label={t('settings.fabLayout.swapPosition')}
              description={t('settings.fabLayout.swapPositionDescription')}
              id="fab-swap-position"
              testId="switch-fab-swap-position"
              checked={fabSwapPosition}
              onChange={(v) => {
                setFabSwapPosition(v);
                save({ fabLayout: { swapPosition: v } });
              }}
            />
          </SettingsSection>
          <SectionHint>{t('settings.fabLayout.hint')}</SectionHint>
        </div>

        {/* ── Database ── */}
        <div
          id="section-database"
          className="grid scroll-mt-18 grid-cols-1 gap-x-5 rounded-lg lg:grid-cols-[1fr_280px]"
        >
          <SettingsSection
            icon={Database}
            title={t('settings.database.title')}
            description={t('settings.database.sectionDescription')}
            testId="database-settings-section"
          >
            <SettingsRow
              label={t('settings.database.location')}
              description={t('settings.database.locationDescription')}
            >
              <span
                className="text-muted-foreground max-w-50 truncate font-mono text-xs"
                data-testid="shep-home-path"
              >
                {shepHome}
              </span>
            </SettingsRow>
            <SettingsRow label={t('settings.database.size')}>
              <span className="text-muted-foreground text-xs" data-testid="db-file-size">
                {dbFileSize}
              </span>
            </SettingsRow>
          </SettingsSection>
          <SectionHint
            links={[
              {
                label: t('settings.database.links.settingsService'),
                href: 'https://github.com/shep-ai/shep/blob/main/docs/architecture/settings-service.md',
              },
              {
                label: t('settings.database.links.settingsSpec'),
                href: 'https://github.com/shep-ai/shep/blob/main/specs/005-global-settings-service/spec.md',
              },
            ]}
          >
            {t('settings.database.hint')}
          </SectionHint>
        </div>
      </div>
    </div>
  );
}
