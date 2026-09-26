'use client';

import { useState, useCallback, useRef, useEffect, useId } from 'react';
import { SendHorizontal, Paperclip, Loader2, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { createProjectAndFeature } from '@/app/actions/create-project-and-feature';
import { createApplication } from '@/app/actions/create-application';
import { getDefaultAgentAndModel } from '@/app/actions/get-default-agent-and-model';
import { AgentModelPicker } from '@/components/features/settings/AgentModelPicker';
import { AttachmentChip } from '@/components/common/attachment-chip';
import { ShepLogo } from '@/components/common/shep-logo';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useAttachments } from '@/hooks/use-attachments';
import { BuildMode } from '@shepai/core/domain/generated/output';
import { findExistingFolderReference } from '@shepai/core/domain/shared/existing-code-reference';
import { isAbsolutePath } from '@shepai/core/domain/shared/absolute-path';
import {
  PROTOTYPE_MODE,
  COMPOSER_BUILD_MODES,
  COMPOSER_BUILD_MODE_CONFIG,
  FEATURE_SURFACE_DEFAULT_MODE,
  type ComposerBuildMode,
} from './build-mode-options';
import { BuildModeMenu } from './build-mode-menu';
import { ExistingCodeHint } from './existing-code-hint';

/**
 * Physical key of the build-mode cycle chord: Alt+Shift+M ("M" = mode).
 *
 * It is deliberately NOT Shift+Tab — that belongs to backward keyboard
 * navigation (WCAG 2.1.1 / 2.1.2) and must never be swallowed — and NOT
 * Ctrl/Cmd+Shift+M, which the globally mounted `ChatSheet` already binds on
 * `document` for maximize. `Alt+Shift+<letter>` is unclaimed by Chrome,
 * Firefox, Safari and Edge.
 *
 * Matching on `event.code` keeps it layout independent: macOS composes
 * Option+Shift+M into "Â", so `event.key` alone would miss it there.
 */
const MODE_CHORD_CODE = 'KeyM';
const MODE_CHORD_KEY = 'm';

/** True on macOS, for shortcut notation (see drawer-action-bar). */
function isMacPlatform(): boolean {
  return typeof navigator !== 'undefined' && /Mac/i.test(navigator.userAgent);
}

/** Human-readable build-mode chord, in the platform's notation. */
function getModeChordLabel(): string {
  return isMacPlatform() ? '⌥⇧M' : 'Alt+Shift+M';
}

/** Human-readable submit chord (handled by the textarea's Ctrl/Cmd+Enter). */
function getSubmitChordLabel(): string {
  return isMacPlatform() ? '⌘↵' : 'Ctrl+↵';
}

export interface ControlCenterEmptyStateProps {
  /** Present on surfaces that can start Features; enables the mode picker. */
  onRepositorySelect?: (path: string) => void;
  onApplicationCreated?: (applicationId: string) => void;
  /**
   * Called when the prompt names an existing folder and the user chooses to
   * work on it instead of creating an empty project. Omit to show guidance only.
   */
  onOpenExistingFolder?: (path: string, prompt: string) => void;
  /** Mode selected on open. Defaults to Spec-driven when features can be started. */
  initialMode?: ComposerBuildMode;
  onClose?: () => void;
  className?: string;
}

export function ControlCenterEmptyState({
  onRepositorySelect,
  onApplicationCreated,
  onOpenExistingFolder,
  initialMode,
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
  // Apps-only surface (no onRepositorySelect handler): fast/spec modes don't
  // make sense — there's no canvas to attach a feature to. Force the App
  // Builder mode and hide the picker so the UI doesn't promise behavior we
  // don't have.
  const showModeDropdown = Boolean(onRepositorySelect);
  const [buildMode, setBuildMode] = useState<ComposerBuildMode>(
    initialMode ?? (showModeDropdown ? FEATURE_SURFACE_DEFAULT_MODE : PROTOTYPE_MODE)
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isFocused, setIsFocused] = useState(false);
  // Announced to assistive tech whenever the build mode changes — switching
  // mode changes what the agent does to the user's code, so it must not be a
  // purely visual state change.
  const [modeAnnouncement, setModeAnnouncement] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const promptId = useId();
  const errorId = useId();
  const att = useAttachments();

  const effectiveMode: ComposerBuildMode = showModeDropdown ? buildMode : PROTOTYPE_MODE;
  const existingFolder = findExistingFolderReference(description);

  const modeChordLabel = getModeChordLabel();
  const submitChordLabel = getSubmitChordLabel();

  const selectBuildMode = useCallback(
    (mode: ComposerBuildMode) => {
      setBuildMode(mode);
      const cfg = COMPOSER_BUILD_MODE_CONFIG[mode];
      setModeAnnouncement(
        t('emptyState.buildModeChanged', 'Build mode: {{mode}}', {
          mode: t(cfg.labelKey, cfg.label),
        })
      );
    },
    [t]
  );

  const cycleBuildMode = useCallback(() => {
    const idx = COMPOSER_BUILD_MODES.indexOf(buildMode);
    selectBuildMode(COMPOSER_BUILD_MODES[(idx + 1) % COMPOSER_BUILD_MODES.length]);
  }, [buildMode, selectBuildMode]);

  /**
   * Build-mode chord, scoped to the composer subtree.
   *
   * This used to be a `window` listener that `preventDefault`ed EVERY
   * Shift+Tab on the document, which made backward keyboard navigation
   * impossible page-wide. It is now an explicit chord handled by React's
   * `onKeyDown` on the composer container, so it can only fire while focus is
   * inside the composer — and Shift+Tab is left alone.
   */
  const handleComposerKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (!showModeDropdown) return;
      if (!e.altKey || !e.shiftKey || e.ctrlKey || e.metaKey) return;
      if (e.code !== MODE_CHORD_CODE && e.key.toLowerCase() !== MODE_CHORD_KEY) return;
      e.preventDefault();
      cycleBuildMode();
    },
    [showModeDropdown, cycleBuildMode]
  );

  // Escape closes the overlay. Dialog-style dismissal is document-wide by
  // convention, and it neither blocks navigation nor mutates anything.
  useEffect(() => {
    if (!onClose) return;
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [onClose]);

  const handleSubmit = useCallback(async () => {
    if (!description.trim() || submitting) return;

    setSubmitting(true);
    setError(null);

    try {
      // When there's no onRepositorySelect handler (e.g. applications-only
      // surface), fast/spec modes can't navigate to a repository canvas.
      // Route ALL modes through the application creation flow so the user
      // lands on /application/[id] regardless of selected mode.
      const useApplicationFlow = effectiveMode === BuildMode.Application || !onRepositorySelect;

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
          buildMode: effectiveMode,
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

  const modeConfig = COMPOSER_BUILD_MODE_CONFIG[effectiveMode];
  const openExistingFolder =
    existingFolder && onOpenExistingFolder && isAbsolutePath(existingFolder)
      ? () => onOpenExistingFolder(existingFolder, description.trim())
      : undefined;

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
            onKeyDown={handleComposerKeyDown}
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
            {/* Textarea — supports paste for images. The placeholder rotates
                with the build mode, so it can't serve as the field's name: a
                visually hidden label carries it instead. */}
            <label htmlFor={promptId} className="sr-only">
              {t('emptyState.promptLabel', 'Describe what you want to build')}
            </label>
            <textarea
              id={promptId}
              ref={textareaRef}
              rows={2}
              autoFocus
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              onKeyDown={handleKeyDown}
              onPaste={att.handlePaste}
              placeholder={modeConfig.placeholder}
              disabled={submitting}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? errorId : undefined}
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
              <p role="alert" className="text-destructive px-4 pb-2 text-xs">
                {att.uploadError}
              </p>
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

              {/* Build mode dropdown — Alt+Shift+M cycles it from inside the
                  composer. Only shown when the surface can actually act on
                  fast/spec (i.e. there's an onRepositorySelect handler tied to
                  a canvas). */}
              {showModeDropdown ? (
                <BuildModeMenu
                  mode={effectiveMode}
                  onSelect={selectBuildMode}
                  chordLabel={modeChordLabel}
                />
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

              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={handleSubmit}
                    disabled={!description.trim() || submitting}
                    aria-label={t('accessibility.send')}
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
                </TooltipTrigger>
                <TooltipContent side="top">{`${t('accessibility.send')} (${submitChordLabel})`}</TooltipContent>
              </Tooltip>
            </div>
          </div>

          {/* Consequential state change — announce it rather than only
              re-rendering the mode label. */}
          <span
            role="status"
            aria-live="polite"
            data-testid="build-mode-announcement"
            className="sr-only"
          >
            {modeAnnouncement}
          </span>

          {/* What the selected mode does and which stack it produces. */}
          <p
            data-testid="build-mode-description"
            className="text-muted-foreground mt-3 text-center text-xs leading-relaxed"
          >
            <span className="text-foreground/80 font-medium">
              {t(modeConfig.stackKey, modeConfig.stack)}
            </span>
            {' · '}
            {t(modeConfig.descriptionKey, modeConfig.description)}
          </p>

          {existingFolder ? (
            <ExistingCodeHint path={existingFolder} onOpen={openExistingFolder} className="mt-3" />
          ) : null}

          {error ? (
            <p id={errorId} role="alert" className="text-destructive mt-2 text-center text-sm">
              {error}
            </p>
          ) : null}
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
