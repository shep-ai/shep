'use client';

import { useState, useCallback, useEffect } from 'react';
import {
  FolderOpen,
  FolderPlus,
  Copy,
  Check,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Terminal,
  ChevronDown,
  ExternalLink,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { pickFolder } from '@/components/common/add-repository-button/pick-folder';
import { ReactFileManagerDialog } from '@/components/common/react-file-manager-dialog';
import { useFeatureFlags } from '@/hooks/feature-flags-context';
import { isAgentSetupComplete } from '@/app/actions/agent-setup-flag';
import { checkAgentAuth } from '@/app/actions/check-agent-auth';
import type { AgentAuthStatus } from '@/app/actions/check-agent-auth';
import { checkToolStatus } from '@/app/actions/check-tool-status';
import type { ToolStatusResult, ToolStatusEntry } from '@/app/actions/check-tool-status';
import { WelcomeAgentSetup } from './welcome-agent-setup';
import { NewProjectDialog } from './new-project-dialog';

export interface ControlCenterEmptyStateProps {
  onRepositorySelect?: (path: string) => void;
  className?: string;
}

const commands = ['cd ~/my-repo', 'shep feat new "sleek dashboard"'];

export function ControlCenterEmptyState({
  onRepositorySelect,
  className,
}: ControlCenterEmptyStateProps) {
  const { t } = useTranslation('web');
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showReactPicker, setShowReactPicker] = useState(false);
  const [agentReady, setAgentReady] = useState<boolean | null>(null);
  const [authStatus, setAuthStatus] = useState<AgentAuthStatus | null>(null);
  const [cliExpanded, setCliExpanded] = useState(false);
  const [toolStatus, setToolStatus] = useState<ToolStatusResult | null>(null);
  const [newProjectOpen, setNewProjectOpen] = useState(false);
  const { reactFileManager: useReactFileManager } = useFeatureFlags();

  useEffect(() => {
    isAgentSetupComplete().then((done) => {
      setAgentReady(done);
    });
  }, []);

  useEffect(() => {
    if (!agentReady) return;
    checkAgentAuth().then(setAuthStatus);
    checkToolStatus().then(setToolStatus);
  }, [agentReady]);

  async function handlePickerClick() {
    if (loading) return;

    if (useReactFileManager) {
      setShowReactPicker(true);
      return;
    }

    setLoading(true);
    try {
      const path = await pickFolder();
      if (path) {
        onRepositorySelect?.(path);
      }
    } catch {
      // Native picker failed — fall back to React file manager
      setShowReactPicker(true);
    } finally {
      setLoading(false);
    }
  }

  function handleReactPickerSelect(path: string | null) {
    if (path) {
      onRepositorySelect?.(path);
    }
    setShowReactPicker(false);
  }

  const handleCopy = useCallback(async () => {
    await navigator.clipboard.writeText(commands.join('\n'));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, []);

  const handleAgentSetupComplete = useCallback(() => {
    setAgentReady(true);
  }, []);

  const handleRetryAuth = useCallback(() => {
    setAuthStatus(null);
    checkAgentAuth().then(setAuthStatus);
  }, []);

  if (agentReady === null) return null;

  return (
    <div
      data-testid="control-center-empty-state"
      className={cn(
        'relative flex h-full w-full flex-col items-center justify-center px-8',
        className
      )}
    >
      {/* Vertically centered content */}
      {!agentReady ? (
        /* Agent setup wizard — owns its own hero */
        <WelcomeAgentSetup onComplete={handleAgentSetupComplete} />
      ) : (
        /* Repository step — fade in to match wizard transitions */
        <div className="animate-in fade-in flex w-full max-w-md flex-col items-center duration-300">
          <h1 className="text-foreground/90 text-center text-5xl font-extralight tracking-tight">
            {t('emptyState.addProject')}
          </h1>
          <p className="text-muted-foreground mt-3 text-center text-lg leading-relaxed font-light">
            {t('emptyState.addProjectDescription')}
            <br />
            {t('emptyState.addProjectDescriptionLine2')}
          </p>

          {/* Status checklist */}
          <div className="mt-8 flex w-full flex-col gap-3">
            <AgentAuthBanner status={authStatus} onRetry={handleRetryAuth} />
            <ToolStatusRow
              label={t('emptyState.git')}
              status={toolStatus?.git ?? null}
              missingHint={t('emptyState.gitRequired')}
            />
            <ToolStatusRow
              label={t('emptyState.githubCli')}
              status={toolStatus?.gh ?? null}
              missingHint={t('emptyState.githubCliRequired')}
            />
          </div>
          {/* Primary CTA */}
          <button
            type="button"
            data-testid="empty-state-add-repository"
            onClick={handlePickerClick}
            disabled={loading}
            className="bg-foreground text-background hover:bg-foreground/90 mt-10 flex w-full cursor-pointer items-center justify-center gap-2.5 rounded-xl px-6 py-4 text-base font-medium shadow-lg transition-all duration-200 hover:shadow-xl active:scale-[0.98] disabled:cursor-wait disabled:opacity-50"
          >
            {loading ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <FolderOpen className="h-5 w-5" />
            )}
            {loading ? t('emptyState.opening') : t('emptyState.chooseFolder')}
          </button>

          {/* Secondary CTA — create a brand-new project folder under shep home */}
          <button
            type="button"
            data-testid="empty-state-new-project"
            onClick={() => setNewProjectOpen(true)}
            disabled={loading}
            className="border-foreground/15 text-foreground/80 hover:bg-foreground/5 hover:border-foreground/25 mt-3 flex w-full cursor-pointer items-center justify-center gap-2.5 rounded-xl border px-6 py-3.5 text-sm font-medium transition-all duration-200 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
          >
            <FolderPlus className="h-4 w-4" />
            New Project
          </button>

          {/* Subtitle under CTA */}
          <p className="text-muted-foreground/60 mt-3 text-center text-sm">
            {t('emptyState.folderHint')}
          </p>
        </div>
      )}

      {/* CLI toggle — anchored to bottom, doesn't shift centered content */}
      {agentReady ? (
        <div
          className="absolute bottom-8 flex flex-col items-center"
          style={{
            animationDelay: '400ms',
            animationDuration: '600ms',
            animationFillMode: 'both',
          }}
        >
          <button
            type="button"
            onClick={() => setCliExpanded(!cliExpanded)}
            className="text-muted-foreground hover:text-foreground flex cursor-pointer items-center gap-1.5 transition-colors duration-200"
          >
            <Terminal className="h-3.5 w-3.5" />
            <span className="text-sm">{t('emptyState.orUseCli')}</span>
            <ChevronDown
              className={cn(
                'h-3.5 w-3.5 transition-transform duration-200',
                cliExpanded ? '' : 'rotate-180'
              )}
            />
          </button>

          {cliExpanded ? (
            <div className="animate-in fade-in slide-in-from-top-1 mt-3 w-80 duration-200">
              <div
                data-testid="cli-code-block"
                className="relative rounded-xl bg-zinc-900 px-5 py-4 font-mono text-[13px] leading-relaxed text-zinc-400"
              >
                <button
                  type="button"
                  data-testid="cli-code-block-copy"
                  onClick={handleCopy}
                  className="absolute top-3 right-3 cursor-pointer rounded-md p-1.5 text-zinc-600 transition-colors hover:bg-zinc-800 hover:text-zinc-300"
                  aria-label={t('emptyState.copyCommands')}
                >
                  {copied ? (
                    <Check className="h-3.5 w-3.5 text-emerald-400" />
                  ) : (
                    <Copy className="h-3.5 w-3.5" />
                  )}
                </button>
                <div className="space-y-1">
                  {commands.map((cmd) => (
                    <div key={cmd} className="whitespace-nowrap">
                      <span className="text-zinc-600 select-none">$ </span>
                      <span className="text-zinc-300">{cmd}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
      <ReactFileManagerDialog
        open={showReactPicker}
        onOpenChange={(open) => {
          if (!open) setShowReactPicker(false);
        }}
        onSelect={handleReactPickerSelect}
      />
      <NewProjectDialog
        open={newProjectOpen}
        onOpenChange={setNewProjectOpen}
        onCreated={(path) => onRepositorySelect?.(path)}
      />
    </div>
  );
}

/** Status row for the AI agent (Claude Code, etc.) */
function AgentAuthBanner({
  status,
  onRetry,
}: {
  status: AgentAuthStatus | null;
  onRetry: () => void;
}) {
  const { t } = useTranslation('web');

  if (!status) {
    return (
      <ChecklistRow icon={<Loader2 className="text-muted-foreground/50 h-4 w-4 animate-spin" />}>
        <span className="text-muted-foreground/50 text-sm">{t('emptyState.checkingSetup')}</span>
      </ChecklistRow>
    );
  }

  if (status.installed && status.authenticated) {
    return (
      <ChecklistRow icon={<CheckCircle2 className="h-4 w-4 text-emerald-500" />}>
        <span className="text-sm text-emerald-600 dark:text-emerald-400">
          {t('emptyState.ready', { label: status.label })}
        </span>
      </ChecklistRow>
    );
  }

  if (!status.installed) {
    return (
      <ChecklistRow icon={<AlertCircle className="h-4 w-4 text-amber-500" />}>
        <span className="text-sm font-medium text-amber-600 dark:text-amber-400">
          {t('emptyState.notInstalled', { label: status.label })}
        </span>
        {status.installCommand ? <CopyableCommand command={status.installCommand} /> : null}
        <button
          type="button"
          onClick={onRetry}
          className="text-xs text-amber-600 underline underline-offset-2 hover:text-amber-800 dark:text-amber-400"
        >
          {t('emptyState.reCheck')}
        </button>
      </ChecklistRow>
    );
  }

  return (
    <ChecklistRow icon={<AlertCircle className="h-4 w-4 text-amber-500" />}>
      <span className="text-sm font-medium text-amber-600 dark:text-amber-400">
        {t('emptyState.needsAuth', { label: status.label })}
      </span>
      {status.authCommand ? <CopyableCommand command={status.authCommand} /> : null}
      <div className="flex items-center gap-3">
        {status.binaryName ? (
          <button
            type="button"
            data-testid="auth-banner-open-terminal"
            onClick={async () => {
              try {
                const toolId =
                  status.agentType === 'claude-code' ? 'claude-code' : status.agentType;
                await fetch(`/api/tools/${toolId}/launch`, { method: 'POST' });
              } catch {
                /* best effort */
              }
            }}
            className="flex items-center gap-1 text-xs font-medium text-amber-600 underline underline-offset-2 hover:text-amber-800 dark:text-amber-400"
          >
            <Terminal className="h-3 w-3" />
            {t('emptyState.open', { label: status.label })}
          </button>
        ) : null}
        <button
          type="button"
          onClick={onRetry}
          className="text-xs text-amber-600 underline underline-offset-2 hover:text-amber-800 dark:text-amber-400"
        >
          {t('emptyState.reCheck')}
        </button>
      </div>
    </ChecklistRow>
  );
}

/** Status row for system tools (git, gh) */
function ToolStatusRow({
  label,
  status,
  missingHint,
}: {
  label: string;
  status: ToolStatusEntry | null;
  missingHint: string;
}) {
  const { t } = useTranslation('web');

  if (!status) {
    return (
      <ChecklistRow icon={<Loader2 className="text-muted-foreground/50 h-4 w-4 animate-spin" />}>
        <span className="text-muted-foreground/50 text-sm">
          {t('emptyState.checking', { label })}
        </span>
      </ChecklistRow>
    );
  }

  if (status.installed) {
    return (
      <ChecklistRow icon={<CheckCircle2 className="h-4 w-4 text-emerald-500" />}>
        <span className="flex items-baseline gap-2">
          <span className="text-sm text-emerald-600 dark:text-emerald-400">
            {t('emptyState.ready', { label })}
          </span>
          {status.version ? (
            <span className="text-muted-foreground/40 text-xs">v{status.version}</span>
          ) : null}
        </span>
      </ChecklistRow>
    );
  }

  return (
    <ChecklistRow icon={<AlertCircle className="h-4 w-4 text-amber-500" />}>
      <span className="text-sm font-medium text-amber-600 dark:text-amber-400">
        {t('emptyState.notFound', { label })}
      </span>
      <span className="text-muted-foreground/50 text-xs">{missingHint}</span>
      {status.installCommand ? <CopyableCommand command={status.installCommand} /> : null}
      {status.installUrl ? (
        <a
          href={status.installUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-xs text-amber-600 underline underline-offset-2 hover:text-amber-800 dark:text-amber-400"
        >
          {t('emptyState.docs')} <ExternalLink className="h-3 w-3" />
        </a>
      ) : null}
    </ChecklistRow>
  );
}

/** Checklist row: icon pinned left, children stacked vertically and fill width */
function ChecklistRow({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="animate-in fade-in flex items-start gap-2.5">
      <div className="mt-0.5 shrink-0">{icon}</div>
      <div className="flex min-w-0 flex-1 flex-col gap-1">{children}</div>
    </div>
  );
}

/** Compact copyable command block — fills available row width */
function CopyableCommand({ command }: { command: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <button
      type="button"
      onClick={async () => {
        await navigator.clipboard.writeText(command);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
      className="group/cmd flex cursor-pointer items-center justify-between gap-2 rounded-md bg-zinc-100 py-1 ps-2.5 pe-2 text-start transition-colors hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700"
    >
      <code className="min-w-0 truncate text-[11px] leading-relaxed text-zinc-600 dark:text-zinc-300">
        {command}
      </code>
      {copied ? (
        <Check className="h-3 w-3 shrink-0 text-emerald-500" />
      ) : (
        <Copy className="h-3 w-3 shrink-0 text-zinc-400 opacity-0 transition-opacity group-hover/cmd:opacity-100" />
      )}
    </button>
  );
}
