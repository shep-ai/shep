'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import {
  SendHorizontal,
  Paperclip,
  Loader2,
  LayoutGrid,
  Zap,
  ClipboardList,
  ChevronDown,
  Check,
  X,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { createProjectAndFeature } from '@/app/actions/create-project-and-feature';
import { createApplication } from '@/app/actions/create-application';
import { getDefaultAgentAndModel } from '@/app/actions/get-default-agent-and-model';
import { AgentModelPicker } from '@/components/features/settings/AgentModelPicker';
import { AttachmentChip } from '@/components/common/attachment-chip';
import { ShepLogo } from '@/components/common/shep-logo';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useAttachments } from '@/hooks/use-attachments';

type BuildMode = 'application' | 'fast' | 'spec';

const BUILD_MODES: BuildMode[] = ['application', 'fast', 'spec'];

const BUILD_MODE_CONFIG: Record<
  BuildMode,
  {
    icon: React.ElementType;
    label: string;
    placeholder: string;
    suggestions: string[];
  }
> = {
  application: {
    icon: LayoutGrid,
    label: 'Application',
    placeholder: 'Build a modern e-commerce storefront with product catalog...',
    suggestions: [
      'A landing page with hero, features, and pricing sections',
      'Full-stack SaaS app with auth, billing, and dashboard',
      'Mobile-first social media app with real-time chat',
      'Personal portfolio with blog and project showcase',
    ],
  },
  fast: {
    icon: Zap,
    label: 'Fast',
    placeholder: 'Add a dark mode toggle to the settings page...',
    suggestions: [
      'Add pagination to the users list endpoint',
      'Fix the broken logout redirect',
      'Add input validation to the signup form',
      'Refactor the API error handling middleware',
    ],
  },
  spec: {
    icon: ClipboardList,
    label: 'Spec Driven',
    placeholder: 'Implement a role-based access control system with audit logging...',
    suggestions: [
      'OAuth2 authentication with SSO and MFA support',
      'Event-driven notification system with email and push',
      'REST API with versioning, rate limiting, and OpenAPI docs',
      'Data pipeline with ETL, validation, and monitoring',
    ],
  },
};

export interface ControlCenterEmptyStateProps {
  onRepositorySelect?: (path: string) => void;
  onApplicationCreated?: (applicationId: string) => void;
  onClose?: () => void;
  className?: string;
}

export function ControlCenterEmptyState({
  onRepositorySelect,
  onApplicationCreated,
  onClose,
  className,
}: ControlCenterEmptyStateProps) {
  const { t } = useTranslation('web');
  const [description, setDescription] = useState('');
  // Default agent + model come from the user's settings (the SINGLE
  // source of truth). We seed them from the server action on mount so
  // the picker shows what the system would actually use, and so the
  // values flow through to createApplication even when the user does
  // not interact with the picker. Hardcoding `'claude-code'` here is
  // BANNED — it lies about what's active when the user's settings
  // point elsewhere (e.g. the demo `dev` agent), causing interactive
  // session boots to fail with "Agent type 'dev' does not support
  // interactive sessions".
  const [overrideAgent, setOverrideAgent] = useState<string | undefined>(undefined);
  const [overrideModel, setOverrideModel] = useState<string | undefined>(undefined);
  useEffect(() => {
    void getDefaultAgentAndModel().then((d) => {
      setOverrideAgent((prev) => prev ?? d.agentType);
      setOverrideModel((prev) => prev ?? d.model);
    });
  }, []);
  const [buildMode, setBuildMode] = useState<BuildMode>('application');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isFocused, setIsFocused] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const att = useAttachments();

  // Apps-only surface (no onRepositorySelect handler): fast/spec modes don't
  // make sense — there's no canvas to attach a feature to. Force application
  // mode and hide the dropdown so the UI doesn't promise behavior we don't have.
  const showModeDropdown = Boolean(onRepositorySelect);
  const effectiveMode: BuildMode = showModeDropdown ? buildMode : 'application';

  // Circular mode switching with Shift+Tab, close overlay with Escape
  const cycleBuildMode = useCallback(() => {
    setBuildMode((prev) => {
      const idx = BUILD_MODES.indexOf(prev);
      return BUILD_MODES[(idx + 1) % BUILD_MODES.length];
    });
  }, []);

  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && onClose) onClose();
      // Shift+Tab cycles only when the dropdown is actually visible —
      // mutating hidden state would be confusing.
      if (e.key === 'Tab' && e.shiftKey && onRepositorySelect) {
        e.preventDefault();
        cycleBuildMode();
      }
    };
    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [onClose, cycleBuildMode, onRepositorySelect]);

  const handleSubmit = useCallback(async () => {
    if (!description.trim() || submitting) return;

    setSubmitting(true);
    setError(null);

    try {
      // When there's no onRepositorySelect handler (e.g. applications-only
      // surface), fast/spec modes can't navigate to a repository canvas.
      // Route ALL modes through the application creation flow so the user
      // lands on /application/[id] regardless of selected mode.
      const useApplicationFlow = effectiveMode === 'application' || !onRepositorySelect;

      if (useApplicationFlow) {
        // The server action creates the app AND synchronously posts the
        // user's prompt as the first interactive chat message, so when we
        // navigate, /application/[id] SSR-loads chat state and the message
        // is visible on first paint. No prompt in the URL, no extra
        // round trip on the client.
        const result = await createApplication({
          description: description.trim(),
          agentType: overrideAgent,
          modelOverride: overrideModel,
          initialPrompt: description.trim(),
        });

        if (result.error) {
          setError(result.error);
          setSubmitting(false);
          return;
        }

        if (result.application) {
          onApplicationCreated?.(result.application.id);
        }
      } else {
        const result = await createProjectAndFeature({
          description: description.trim(),
          attachments: att.completedAttachments.map((a) => ({
            path: a.path,
            name: a.name,
            notes: a.notes,
          })),
          agentType: overrideAgent,
          model: overrideModel,
          fast: effectiveMode === 'fast',
        });

        if (result.error) {
          setError(result.error);
          setSubmitting(false);
          return;
        }

        if (result.repositoryPath) {
          onRepositorySelect?.(result.repositoryPath);
        }

        if (result.feature && result.repositoryPath) {
          window.dispatchEvent(
            new CustomEvent('shep:feature-created', {
              detail: {
                featureId: result.feature.id,
                name: result.feature.name,
                description: result.feature.description,
                repositoryPath: result.repositoryPath,
              },
            })
          );
        }
      }
    } catch {
      setError('Something went wrong. Please try again.');
      setSubmitting(false);
    }
  }, [
    description,
    submitting,
    effectiveMode,
    att.completedAttachments,
    overrideAgent,
    overrideModel,
    onRepositorySelect,
    onApplicationCreated,
  ]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        handleSubmit();
      }
    },
    [handleSubmit]
  );

  const handlePickFiles = useCallback(async () => {
    try {
      const res = await fetch('/api/dialog/pick-files');
      if (!res.ok) return;
      const data = (await res.json()) as { paths?: string[] };
      if (!data.paths?.length) return;
      for (const filePath of data.paths) {
        const uploadRes = await fetch('/api/attachments/upload-from-path', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ path: filePath, sessionId: 'onboarding' }),
        });
        if (!uploadRes.ok) continue;
        const uploaded = (await uploadRes.json()) as {
          id: string;
          name: string;
          size: number;
          mimeType: string;
          path: string;
        };
        att.addAttachment(uploaded);
      }
    } catch {
      // Native picker not available — ignore
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- att.addAttachment is stable
  }, [att.addAttachment]);

  const handleSuggestionClick = useCallback((suggestion: string) => {
    setDescription(suggestion);
    textareaRef.current?.focus();
  }, []);

  const modeConfig = BUILD_MODE_CONFIG[effectiveMode];
  const ModeIcon = modeConfig.icon;

  return (
    <div
      data-testid="control-center-empty-state"
      className={cn(
        'relative flex h-full w-full flex-col items-center justify-center overflow-hidden px-8',
        className
      )}
    >
      {/* Gradient background — covers canvas dots */}
      <div className="onboard-bg pointer-events-none absolute inset-0 animate-[onboard-fade-in_1.2s_ease-out_both]" />

      {/* Close button — only shown when used as overlay */}
      {onClose ? (
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="text-muted-foreground hover:text-foreground hover:bg-accent/50 absolute top-4 right-4 z-10 cursor-pointer rounded p-1.5 transition-colors"
        >
          <X className="h-5 w-5" />
        </button>
      ) : null}

      <div className="relative flex w-full max-w-2xl flex-col items-center">
        {/* Shep Logo */}
        <div
          className="mb-6 animate-[onboard-logo_0.8s_cubic-bezier(0.16,1,0.3,1)_both]"
          style={{ animationDelay: '0ms' }}
        >
          <ShepLogo size={72} className="text-foreground" />
        </div>

        {/* Hero text */}
        <h1
          className="text-foreground animate-[onboard-fade-up_0.7s_cubic-bezier(0.16,1,0.3,1)_both] text-center text-5xl font-extralight tracking-tight"
          style={{ animationDelay: '120ms' }}
        >
          What do you want to build?
        </h1>
        <p
          className="text-muted-foreground mt-3 animate-[onboard-fade-up_0.7s_cubic-bezier(0.16,1,0.3,1)_both] text-center text-lg leading-relaxed font-light"
          style={{ animationDelay: '220ms' }}
        >
          Describe your idea and Shep creates the project for you.
        </p>

        {/* Prompt box */}
        <div
          className="mt-10 w-full animate-[onboard-fade-up_0.7s_cubic-bezier(0.16,1,0.3,1)_both]"
          style={{ animationDelay: '350ms' }}
        >
          <div
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            onDragEnter={att.handleDragEnter}
            onDragLeave={att.handleDragLeave}
            onDragOver={att.handleDragOver}
            onDrop={att.handleDrop}
            className={cn(
              'flex flex-col rounded-xl border transition-all duration-200',
              'border-border/60 bg-background shadow-sm dark:border-white/10 dark:bg-white/[0.04]',
              isFocused &&
                'ring-ring/50 border-ring shadow-md ring-[3px] dark:border-orange-500/40 dark:ring-orange-500/25',
              att.isDragOver && 'border-primary/50 bg-primary/5',
              submitting && 'opacity-70'
            )}
          >
            {/* Textarea — supports paste for images */}
            <textarea
              ref={textareaRef}
              rows={2}
              autoFocus
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              onKeyDown={handleKeyDown}
              onPaste={att.handlePaste}
              placeholder={modeConfig.placeholder}
              disabled={submitting}
              className="text-foreground placeholder:text-muted-foreground/60 max-h-[10rem] min-h-[4.5rem] w-full resize-none border-0 bg-transparent px-4 py-3.5 text-sm leading-relaxed focus:outline-none disabled:cursor-not-allowed"
            />

            {/* Attachment chips */}
            {att.attachments.length > 0 ? (
              <div className="flex shrink-0 items-center gap-2.5 overflow-x-auto overflow-y-visible px-5 pt-2 pb-2">
                {att.attachments.map((file) => (
                  <AttachmentChip
                    key={file.id}
                    name={file.name}
                    size={file.size}
                    mimeType={file.mimeType}
                    path={file.path}
                    onRemove={() => att.removeAttachment(file.id)}
                    loading={file.loading}
                    notes={file.notes}
                    onNotesChange={(notes) => att.updateNotes(file.id, notes)}
                  />
                ))}
              </div>
            ) : null}

            {/* Upload error */}
            {att.uploadError ? (
              <p className="text-destructive px-4 pb-2 text-xs">{att.uploadError}</p>
            ) : null}

            {/* Controls bar */}
            <div className="border-border/60 flex shrink-0 items-center gap-3 border-t px-3 py-2 dark:border-white/10">
              <AgentModelPicker
                initialAgentType={overrideAgent ?? ''}
                initialModel={overrideModel ?? ''}
                mode="override"
                showInstallStatus
                onAgentModelChange={(agent, model) => {
                  setOverrideAgent(agent);
                  setOverrideModel(model);
                }}
                className="w-55"
              />
              <div className="flex-1" />

              {/* Build mode dropdown — Shift+Tab to cycle. Only shown when
                  the surface can actually act on fast/spec (i.e. there's an
                  onRepositorySelect handler tied to a canvas). */}
              {showModeDropdown ? (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      data-testid="build-mode-selector"
                      className="text-muted-foreground hover:text-foreground hover:bg-accent/50 flex cursor-pointer items-center gap-1.5 rounded-md px-2 py-1 text-xs transition-colors"
                    >
                      <span
                        key={effectiveMode}
                        className="flex animate-[onboard-fade-up_0.25s_ease-out_both] items-center gap-1.5"
                      >
                        <ModeIcon className="h-3.5 w-3.5" />
                        {modeConfig.label}
                      </span>
                      <ChevronDown className="h-3 w-3 opacity-50" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="min-w-[160px]">
                    {BUILD_MODES.map((mode) => {
                      const cfg = BUILD_MODE_CONFIG[mode];
                      const Icon = cfg.icon;
                      const isActive = effectiveMode === mode;
                      return (
                        <DropdownMenuItem
                          key={mode}
                          onClick={() => setBuildMode(mode)}
                          data-testid={`build-mode-${mode}`}
                          className="flex items-center gap-2"
                        >
                          <Icon className="h-3.5 w-3.5" />
                          <span className="flex-1">{cfg.label}</span>
                          {isActive ? <Check className="text-foreground h-3.5 w-3.5" /> : null}
                        </DropdownMenuItem>
                      );
                    })}
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : null}

              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={handlePickFiles}
                    disabled={submitting}
                    aria-label={t('chat.attachFiles')}
                    className="text-muted-foreground hover:text-foreground cursor-pointer rounded p-1 transition-colors disabled:opacity-50"
                  >
                    <Paperclip className="h-4 w-4" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top">{t('chat.attachFiles')}</TooltipContent>
              </Tooltip>

              <button
                type="button"
                onClick={handleSubmit}
                disabled={!description.trim() || submitting}
                className={cn(
                  'bg-foreground text-background inline-flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-lg',
                  'hover:bg-foreground/90 disabled:pointer-events-none disabled:opacity-30',
                  'transition-all duration-150'
                )}
              >
                {submitting ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <SendHorizontal className="h-3.5 w-3.5" />
                )}
              </button>
            </div>
          </div>

          {error ? <p className="text-destructive mt-2 text-center text-sm">{error}</p> : null}
        </div>

        {/* Suggestion chips — re-animate on mode change */}
        <div
          key={effectiveMode}
          className="mt-6 flex animate-[onboard-fade-up_0.4s_ease-out_both] flex-wrap justify-center gap-2"
        >
          {modeConfig.suggestions.map((suggestion) => (
            <button
              key={suggestion}
              type="button"
              onClick={() => handleSuggestionClick(suggestion)}
              disabled={submitting}
              className="text-muted-foreground hover:text-foreground border-border/60 hover:border-border hover:bg-accent/50 cursor-pointer rounded-full border px-3.5 py-1.5 text-xs transition-all duration-150 disabled:opacity-50 dark:border-white/10 dark:hover:border-white/20 dark:hover:bg-white/[0.06]"
            >
              {suggestion}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
