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
  Minus,
  Plus,
  ExternalLink,
  Settings2,
  Timer,
} from 'lucide-react';
import { toast } from 'sonner';
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
import { type AgentType, EditorType, TerminalType } from '@shepai/core/domain/generated/output';
import { getEditorTypeIcon } from '@/components/common/editor-type-icons';
import { AgentModelPicker } from '@/components/features/settings/AgentModelPicker';
import { TimeoutSlider } from '@/components/features/settings/timeout-slider';
import type {
  Settings,
  FeatureFlags,
  NotificationPreferences,
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
  { id: 'agent', label: 'Agent', icon: Bot },
  { id: 'environment', label: 'Environment', icon: Terminal },
  { id: 'workflow', label: 'Workflow', icon: GitBranch },
  { id: 'ci', label: 'CI', icon: Activity },
  { id: 'stage-timeouts', label: 'Timeouts', icon: Timer },
  { id: 'notifications', label: 'Notifications', icon: Bell },
  { id: 'feature-flags', label: 'Flags', icon: Flag },
  { id: 'database', label: 'Database', icon: Database },
] as const;

export interface SettingsPageClientProps {
  settings: Settings;
  shepHome: string;
  dbFileSize: string;
  availableTerminals?: AvailableTerminal[];
}

function useSaveIndicator() {
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
          toast.error(result.error ?? 'Failed to save settings');
        }
      });
    },
    [startTransition]
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
          aria-label="Decrease"
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
          aria-label="Increase"
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
  const { showSaving, showSaved, save } = useSaveIndicator();
  const featureFlags = settings.featureFlags ?? {
    skills: false,
    envDeploy: false,
    debug: false,
    githubImport: false,
    adoptBranch: false,
    gitRebaseSync: false,
    reactFileManager: false,
    coastsDevServer: false,
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
    : [{ id: TerminalType.System, name: 'System Terminal', available: true as const }];

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
  const [mergeTimeout, setMergeTimeout] = useState(
    String(Math.round((stageTimeoutsConfig?.mergeMs ?? 1_800_000) / 1000))
  );
  // Analyze-repo agent timeout state
  const analyzeRepoConfig = settings.workflow.analyzeRepoTimeouts;
  const [analyzeRepoTimeout, setAnalyzeRepoTimeout] = useState(
    String(Math.round((analyzeRepoConfig?.analyzeMs ?? 600_000) / 1000))
  );

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
      ciMaxFix?: string;
      ciTimeout?: string;
      ciLogMax?: string;
      ciPollInterval?: string;
      analyzeTimeout?: string;
      requirementsTimeout?: string;
      researchTimeout?: string;
      planTimeout?: string;
      implementTimeout?: string;
      mergeTimeout?: string;
      analyzeRepoTimeout?: string;
    } = {}
  ) {
    const timeoutSeconds = parseOptionalInt(overrides.ciTimeout ?? ciTimeout);
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
          <h1 className="text-sm font-bold tracking-tight">Settings</h1>
          <span className="relative h-4 w-16">
            <span
              className={cn(
                'text-muted-foreground absolute inset-0 flex items-center text-xs transition-opacity duration-300',
                showSaving ? 'opacity-100' : 'opacity-0'
              )}
            >
              Saving...
            </span>
            <span
              className={cn(
                'absolute inset-0 flex items-center gap-1 text-xs text-green-600 transition-opacity duration-300',
                showSaved && !showSaving ? 'opacity-100' : 'opacity-0'
              )}
            >
              <Check className="h-3 w-3" />
              Saved
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
                  <span className="hidden sm:inline">{s.label}</span>
                </button>
              );
            })}
          </nav>
        </div>
      </div>

      <div className="flex flex-col gap-3">
        {/* ── Agent ── */}
        <div
          id="section-agent"
          className="grid scroll-mt-18 grid-cols-1 gap-x-5 rounded-lg lg:grid-cols-[1fr_280px]"
        >
          <SettingsSection
            icon={Bot}
            title="Agent"
            description="AI coding agent and authentication"
            testId="agent-settings-section"
          >
            <SettingsRow
              label="Agent & Model"
              description="Provider and model for all operations"
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
                label: 'Agent system',
                href: 'https://github.com/shep-ai/cli/blob/main/docs/architecture/agent-system.md',
              },
              {
                label: 'Adding agents',
                href: 'https://github.com/shep-ai/cli/blob/main/docs/development/adding-agents.md',
              },
              {
                label: 'Configuration guide',
                href: 'https://github.com/shep-ai/cli/blob/main/docs/guides/configuration.md',
              },
            ]}
          >
            Choose which AI coding agent powers your features. Each agent supports different models
            and capabilities. Authentication is resolved automatically via your active session.
          </SectionHint>
        </div>

        {/* ── Environment ── */}
        <div
          id="section-environment"
          className="grid scroll-mt-18 grid-cols-1 gap-x-5 rounded-lg lg:grid-cols-[1fr_280px]"
        >
          <SettingsSection
            icon={Terminal}
            title="Environment"
            description="Editor, shell, and terminal preferences"
            testId="environment-settings-section"
          >
            <SettingsRow
              label="Default Editor"
              description="Editor launched for file operations"
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
              label="Shell"
              description="Default shell for generated scripts"
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
              label="Terminal"
              description="Terminal emulator for shell sessions"
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
                label: 'Configuration guide',
                href: 'https://github.com/shep-ai/cli/blob/main/docs/guides/configuration.md',
              },
            ]}
          >
            Your preferred editor opens files for review. The shell setting controls generated
            scripts. The terminal emulator is launched when opening shell sessions from the web UI.
          </SectionHint>
        </div>

        {/* ── Workflow ── */}
        <div
          id="section-workflow"
          className="grid scroll-mt-18 grid-cols-1 gap-x-5 rounded-lg lg:grid-cols-[1fr_280px]"
        >
          <SettingsSection
            icon={GitBranch}
            title="Workflow"
            description="Automation behavior after implementation"
            testId="workflow-settings-section"
          >
            <SubsectionLabel>Approve</SubsectionLabel>
            <SwitchRow
              label="Auto-approve PRD"
              description="Skip manual review of requirements"
              id="allow-prd"
              testId="switch-allow-prd"
              checked={allowPrd}
              onChange={(v) => {
                setAllowPrd(v);
                save(buildWorkflowPayload({ allowPrd: v }));
              }}
            />
            <SwitchRow
              label="Auto-approve Plan"
              description="Skip manual review of implementation plan"
              id="allow-plan"
              testId="switch-allow-plan"
              checked={allowPlan}
              onChange={(v) => {
                setAllowPlan(v);
                save(buildWorkflowPayload({ allowPlan: v }));
              }}
            />
            <SwitchRow
              label="Auto-approve Merge"
              description="Merge without manual review"
              id="allow-merge"
              testId="switch-allow-merge"
              checked={allowMerge}
              onChange={(v) => {
                setAllowMerge(v);
                save(buildWorkflowPayload({ allowMerge: v }));
              }}
            />
            <SubsectionLabel>Evidence</SubsectionLabel>
            <SwitchRow
              label="Collect evidence"
              description="Capture screenshots and artifacts after implementation"
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
              label="Add evidence to PR"
              description="Include evidence in the pull request body"
              id="commit-evidence"
              testId="switch-commit-evidence"
              checked={commitEvidence}
              disabled={!enableEvidence || !openPr}
              onChange={(v) => {
                setCommitEvidence(v);
                save(buildWorkflowPayload({ commitEvidence: v }));
              }}
            />
            <SubsectionLabel>Git</SubsectionLabel>
            <SwitchRow
              label="Push on complete"
              description="Push to remote when implementation finishes"
              id="push-on-complete"
              testId="switch-push-on-complete"
              checked={pushOnComplete}
              onChange={(v) => {
                setPushOnComplete(v);
                save(buildWorkflowPayload({ pushOnComplete: v }));
              }}
            />
            <SwitchRow
              label="Open PR on complete"
              description="Create a pull request when done"
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
              label="Watch CI after push"
              description="Monitor CI and auto-fix failures. Disable to avoid rate limits."
              id="ci-watch-enabled"
              testId="switch-ci-watch-enabled"
              checked={ciWatchEnabled}
              onChange={(v) => {
                setCiWatchEnabled(v);
                save(buildWorkflowPayload({ ciWatchEnabled: v }));
              }}
            />
          </SettingsSection>
          <SectionHint
            links={[
              {
                label: 'Approval gates',
                href: 'https://github.com/shep-ai/cli/blob/main/specs/016-hitl-approval-gates/spec.yaml',
              },
              {
                label: 'Push & PR flags',
                href: 'https://github.com/shep-ai/cli/blob/main/specs/037-feature-pr-push-flags/spec.yaml',
              },
            ]}
          >
            Control how autonomous each feature run is. Auto-approve skips the human review pause at
            each phase. Push and PR options control what happens after successful implementation.
          </SectionHint>
        </div>

        {/* ── CI ── */}
        <div
          id="section-ci"
          className="grid scroll-mt-18 grid-cols-1 gap-x-5 rounded-lg lg:grid-cols-[1fr_280px]"
        >
          <SettingsSection
            icon={Activity}
            title="Continuous Integration"
            description="Limits and timeouts for CI monitoring"
            testId="ci-settings-section"
          >
            <SettingsRow
              label="Max fix attempts"
              description="Agent retries on failing CI"
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
              label="Watch timeout"
              description="Max wait for CI completion"
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
              label="Max log size"
              description="Truncate CI logs beyond this limit"
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
              label="Poll interval"
              description="How often to check GitHub for CI status updates"
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
              label="Hide CI status"
              description="Hide CI status badges from feature drawer and merge review"
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
                label: 'CI/CD pipeline',
                href: 'https://github.com/shep-ai/cli/blob/main/docs/development/cicd.md',
              },
              {
                label: 'CI security gates',
                href: 'https://github.com/shep-ai/cli/blob/main/specs/003-cicd-security-gates/spec.md',
              },
            ]}
          >
            When a feature completes, the agent can watch CI and auto-fix failures. These limits
            prevent runaway retries and control how much log output is sent to the agent for
            analysis.
          </SectionHint>
        </div>

        {/* ── Stage Timeouts ── */}
        <div
          id="section-stage-timeouts"
          className="grid scroll-mt-18 grid-cols-1 gap-x-5 rounded-lg lg:grid-cols-[1fr_280px]"
        >
          <SettingsSection
            icon={Timer}
            title="Stage Timeouts"
            description="Maximum execution time per agent stage"
            testId="stage-timeouts-settings-section"
          >
            <SubsectionLabel>Feature Agent</SubsectionLabel>
            <SettingsRow
              label="Analyze"
              description="Repository analysis timeout"
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
              label="Requirements"
              description="Requirements gathering timeout"
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
              label="Research"
              description="Technical research timeout"
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
              label="Plan"
              description="Implementation planning timeout"
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
              label="Implement"
              description="Code implementation timeout"
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
              label="Merge"
              description="PR creation and merge timeout"
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
            <SubsectionLabel>Analyze Repository Agent</SubsectionLabel>
            <SettingsRow
              label="Analyze"
              description="Repository analysis timeout"
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
          <SectionHint>
            Each agent has independently configurable stage timeouts. When a stage exceeds its
            timeout, the agent is terminated. Longer timeouts are useful for complex
            implementations. Feature agent defaults to 30 minutes per stage. Analyze repository
            agent defaults to 10 minutes.
          </SectionHint>
        </div>

        {/* ── Notifications ── */}
        <div
          id="section-notifications"
          className="grid scroll-mt-18 grid-cols-1 gap-x-5 rounded-lg lg:grid-cols-[1fr_280px]"
        >
          <SettingsSection
            icon={Bell}
            title="Notifications"
            description="How and when you get notified"
            testId="notification-settings-section"
          >
            <SubsectionLabel>Channels</SubsectionLabel>
            <SwitchRow
              label="In-app"
              description="Notifications inside the Shep UI"
              id="notif-in-app"
              testId="switch-in-app"
              checked={inApp}
              onChange={(v) => {
                setInApp(v);
                save(buildNotificationPayload({ inApp: v }));
              }}
            />

            <SubsectionLabel>Agent Events</SubsectionLabel>
            <SwitchRow
              label="Agent started"
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
              label="Phase completed"
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
              label="Waiting approval"
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
              label="Agent completed"
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
              label="Agent failed"
              id="notif-event-agentFailed"
              testId="switch-event-agentFailed"
              checked={events.agentFailed}
              onChange={(v) => {
                const newEvents = { ...events, agentFailed: v };
                setEvents(newEvents);
                save(buildNotificationPayload({ events: newEvents }));
              }}
            />

            <SubsectionLabel>Pull Request Events</SubsectionLabel>
            <SwitchRow
              label="PR merged"
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
              label="PR closed"
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
              label="PR checks passed"
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
              label="PR checks failed"
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
              label="PR blocked"
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
              label="Merge review ready"
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
                label: 'Notification system',
                href: 'https://github.com/shep-ai/cli/blob/main/specs/021-agent-notifications/spec.yaml',
              },
            ]}
          >
            In-app toast notifications keep you in the loop. Fine-tune which agent lifecycle events
            trigger a notification.
          </SectionHint>
        </div>

        {/* ── Feature Flags ── */}
        <div
          id="section-feature-flags"
          className="grid scroll-mt-18 grid-cols-1 gap-x-5 rounded-lg lg:grid-cols-[1fr_280px]"
        >
          <SettingsSection
            icon={Flag}
            title="Feature Flags"
            description="Enable or disable experimental features"
            badge="Experimental"
            testId="feature-flags-settings-section"
          >
            <SwitchRow
              label="Skills"
              description="Enable the skills system for agent capabilities"
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
              label="Deployments"
              description="Enable environment deployment workflows"
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
              label="Debug"
              description="Show debug panels and verbose logging"
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
              label="GitHub Import"
              description="Enable GitHub repository import in the web UI"
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
              label="Adopt Branch"
              description="Import existing branches as tracked features"
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
              label="Git Rebase & Sync"
              description="Enable git rebase-on-main and sync-main operations"
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
              label="React File Manager"
              description="Use the built-in React file manager instead of the native OS folder picker"
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
              label="Coasts Dev Server"
              description="Enable Coasts containerized runtime isolation for the dev server"
              id="flag-coastsDevServer"
              testId="switch-flag-coastsDevServer"
              checked={flags.coastsDevServer}
              onChange={(v) => {
                const newFlags = { ...flags, coastsDevServer: v };
                setFlags(newFlags);
                save({ featureFlags: newFlags });
              }}
            />
          </SettingsSection>
          <SectionHint>
            Experimental features that are still under development. Enable at your own risk — they
            may change or be removed in future versions. Debug mode adds verbose logging useful for
            troubleshooting.
          </SectionHint>
        </div>

        {/* ── Database ── */}
        <div
          id="section-database"
          className="grid scroll-mt-18 grid-cols-1 gap-x-5 rounded-lg lg:grid-cols-[1fr_280px]"
        >
          <SettingsSection
            icon={Database}
            title="Database"
            description="Local storage information"
            testId="database-settings-section"
          >
            <SettingsRow label="Location" description="Path to the local SQLite database">
              <span
                className="text-muted-foreground max-w-50 truncate font-mono text-xs"
                data-testid="shep-home-path"
              >
                {shepHome}
              </span>
            </SettingsRow>
            <SettingsRow label="Size">
              <span className="text-muted-foreground text-xs" data-testid="db-file-size">
                {dbFileSize}
              </span>
            </SettingsRow>
          </SettingsSection>
          <SectionHint
            links={[
              {
                label: 'Settings service',
                href: 'https://github.com/shep-ai/cli/blob/main/docs/architecture/settings-service.md',
              },
              {
                label: 'Settings spec',
                href: 'https://github.com/shep-ai/cli/blob/main/specs/005-global-settings-service/spec.md',
              },
            ]}
          >
            All settings are stored in a local SQLite database at ~/.shep/data. The database uses a
            singleton record pattern with automatic migrations on startup.
          </SectionHint>
        </div>
      </div>
    </div>
  );
}
