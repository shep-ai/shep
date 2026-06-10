'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import {
  PaperclipIcon,
  ChevronsUpDown,
  CheckIcon,
  Zap,
  Clock,
  FolderPlus,
  Loader2,
  GitFork,
  FileText,
  Plug,
  Puzzle,
  RefreshCw,
  LayoutGrid,
  ClipboardList,
  Github,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useSoundAction } from '@/hooks/use-sound-action';
import { BaseDrawer } from '@/components/common/base-drawer';
import { DrawerTitle, DrawerDescription } from '@/components/ui/drawer';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Switch } from '@/components/ui/switch';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useGuardedDrawerClose } from '@/hooks/drawer-close-guard';
import { AttachmentChip } from '@/components/common/attachment-chip';
import type { WorkflowDefaults } from '@/app/actions/get-workflow-defaults';
import { getViewerPermission } from '@/app/actions/get-viewer-permission';
import { AgentModelPicker } from '@/components/features/settings/AgentModelPicker';
import { Separator } from '@/components/ui/separator';
import { pickFolder } from '@/components/common/add-repository-button/pick-folder';
import { ReactFileManagerDialog } from '@/components/common/react-file-manager-dialog';
import { useFeatureFlags } from '@/hooks/feature-flags-context';
import { addRepository } from '@/app/actions/add-repository';
import { BuildMode as BuildModeEnum } from '@shepai/core/domain/generated/output';
import { GitHubImportDialog } from '@/components/common/github-import-dialog';
import type { Repository } from '@shepai/core/domain/generated/output';
import { pickFiles } from './pick-files';

export type { FileAttachment } from '@shepai/core/infrastructure/services/file-dialog.service';

/** Attachment record for the create form — supports both picker and upload sources. */
export interface FormAttachment {
  id: string;
  name: string;
  size: number;
  mimeType: string;
  path: string;
  loading?: boolean;
  /** Optional user notes or annotations for this image */
  notes?: string;
}

/**
 * Build mode for the create drawer. Type alias derived from the generated
 * TypeSpec `BuildMode` enum so the UI cannot drift from the domain. Internal
 * code uses the enum members (`BuildModeEnum.Fast | .Spec`) per the
 * no-magic-values rule; the exported type is a string-literal union so call
 * sites can pass either enum members (preferred) or matching string literals.
 *
 * Note: the TypeSpec enum still includes `Application` for legacy rows that
 * were created before the picker was simplified — those features keep
 * working, but the drawer no longer offers `Application` as a selectable
 * option since it is operationally identical to `Spec` (both set fast=false).
 */
export type BuildMode = `${BuildModeEnum}`;

const BUILD_MODE_ORDER: readonly BuildMode[] = [BuildModeEnum.Fast, BuildModeEnum.Spec] as const;

const BUILD_MODE_META: Record<BuildMode, { icon: typeof Zap; labelKey: string }> = {
  // Application is retained in the meta map only so legacy `buildMode='application'`
  // rows do not crash if they ever flow through this path; it is never rendered.
  [BuildModeEnum.Application]: { icon: LayoutGrid, labelKey: 'createDrawer.modeApplication' },
  [BuildModeEnum.Fast]: { icon: Zap, labelKey: 'createDrawer.modeFast' },
  [BuildModeEnum.Spec]: { icon: ClipboardList, labelKey: 'createDrawer.modeSpec' },
  // Exploration is retained in the meta map only so legacy `buildMode='exploration'`
  // rows do not crash if they ever flow through this path; it is never rendered in the picker.
  [BuildModeEnum.Exploration]: { icon: RefreshCw, labelKey: 'createDrawer.modeExploration' },
};

/** Minimal feature descriptor for the parent selector. */
export interface ParentFeatureOption {
  id: string;
  name: string;
}

/** Minimal repository descriptor for the repository selector. */
export interface RepositoryOption {
  id: string;
  name: string;
  path: string;
  isFork?: boolean;
  upstreamUrl?: string;
}

export interface FeatureCreatePayload {
  description: string;
  attachments: FormAttachment[];
  repositoryPath: string;
  approvalGates: {
    allowPrd: boolean;
    allowPlan: boolean;
    allowMerge: boolean;
  };
  push: boolean;
  openPr: boolean;
  ciWatchEnabled: boolean;
  enableEvidence: boolean;
  commitEvidence: boolean;
  parentId?: string;
  /** When true, skip SDLC phases and implement directly from the prompt. */
  fast: boolean;
  /** When true, create the feature in pending state (no agent spawned). */
  pending?: boolean;
  /** Fork repo and create PR to upstream at merge time. */
  forkAndPr: boolean;
  /** Commit specs/evidences into the repo (defaults false when forkAndPr is enabled). */
  commitSpecs: boolean;
  /** Sync main from remote before creating the feature branch (default: true). */
  rebaseBeforeBranch: boolean;
  /** Inject curated skills into the feature worktree. */
  injectSkills: boolean;
  /** Per-feature plugin activation overrides (plugin name -> enabled/disabled). */
  activePlugins?: Record<string, boolean>;
  /** Optional agent type override for this feature run */
  agentType?: string;
  /** Optional model override for this feature run */
  model?: string;
  sessionId?: string;
  /** When the drawer was launched scoped to an Application, the
   *  application's domain UUID. Persisted on the Feature so the
   *  Control Center can render an app→feature parent edge instead
   *  of a virtual repository node. */
  applicationId?: string;
}

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

const ALLOWED_EXTENSIONS = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp',
  '.svg',
  '.bmp',
  '.ico',
  '.pdf',
  '.doc',
  '.docx',
  '.xls',
  '.xlsx',
  '.ppt',
  '.pptx',
  '.txt',
  '.md',
  '.csv',
  '.json',
  '.yaml',
  '.yml',
  '.xml',
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.py',
  '.rb',
  '.go',
  '.rs',
  '.java',
  '.c',
  '.cpp',
  '.h',
  '.hpp',
  '.cs',
  '.swift',
  '.kt',
  '.html',
  '.css',
  '.scss',
  '.less',
  '.sh',
  '.bash',
  '.zsh',
  '.fish',
  '.toml',
  '.ini',
  '.cfg',
  '.conf',
  '.env',
  '.zip',
  '.tar',
  '.gz',
  '.log',
]);

function getExtension(filename: string): string {
  const dot = filename.lastIndexOf('.');
  return dot >= 0 ? filename.slice(dot).toLowerCase() : '';
}

const EMPTY_GATES: Record<string, boolean> = {
  allowPrd: false,
  allowPlan: false,
  allowMerge: false,
};

export interface FeatureCreateDrawerProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (data: FeatureCreatePayload) => void;
  repositoryPath: string;
  isSubmitting?: boolean;
  workflowDefaults?: WorkflowDefaults;
  /** List of existing features available for selection as a parent. */
  features?: ParentFeatureOption[];
  /** List of tracked repositories for selection when repo context is missing. */
  repositories?: RepositoryOption[];
  /** Pre-select a parent feature when the drawer opens (e.g. from (+) button on a feature node). */
  initialParentId?: string;
  /** Current global agent type from settings */
  currentAgentType?: string;
  /** Current global model from settings */
  currentModel?: string;
  /** Pre-fill the description textarea (e.g. from session context) */
  initialDescription?: string;
  /** When true, user has push access — Fork & PR toggle will be hidden. */
  canPushDirectly?: boolean;
  /**
   * Pre-select a build mode (e.g. when the drawer is opened from a UI that
   * already chose one — apps page "fast" / "spec" buttons, FAB-with-mode).
   * When omitted, falls back to workflowDefaults.fast (true → 'fast', false →
   * 'spec'); fully omitted defaults select 'fast'.
   *
   * App-scoped invocations (`initialApplicationId` set) seed the picker with
   * `Spec` by default but the mode remains user-editable, so launching a
   * feature against an application behaves like launching one against a
   * regular repository — the user can switch to Fast in one click.
   */
  initialMode?: BuildMode;
  /**
   * Application context for the drawer. When set:
   * - the repository selector is rendered as a locked read-only label (the
   *   app determines the repo, so the user cannot pick a different one)
   * - the mode picker stays editable; it just defaults to `Spec` so the SDD
   *   intent is the easy path while the user can still pick `Fast`
   * - all other fields (description, attachments, advanced toggles) remain
   *   editable
   *
   * Used by entry points launched from an Application (app card "+" button,
   * FAB context-aware action, app top-bar "Open in Control Center") so the
   * created feature is correctly scoped to the application without forcing
   * the user into a single mode.
   */
  initialApplicationId?: string;
  /** Installed plugins available for per-feature activation toggles. */
  installedPlugins?: { name: string; displayName: string; enabled: boolean }[];
}

function resolveInitialMode(
  initialMode: BuildMode | undefined,
  workflowDefaults: WorkflowDefaults | undefined
): BuildMode {
  if (initialMode) return initialMode;
  if (workflowDefaults?.defaultMode) return workflowDefaults.defaultMode as BuildMode;
  return BuildModeEnum.Fast;
}

export function FeatureCreateDrawer({
  open,
  onClose,
  onSubmit,
  repositoryPath,
  isSubmitting = false,
  workflowDefaults,
  features,
  repositories,
  initialParentId,
  currentAgentType,
  currentModel,
  initialDescription,
  canPushDirectly,
  initialMode,
  initialApplicationId,
  installedPlugins,
}: FeatureCreateDrawerProps) {
  const isAppScoped = initialApplicationId !== undefined;
  // App-scoped invocations seed the picker with `Spec` (the SDD intent) so
  // the easy path matches the entry-point name, but the picker remains
  // user-editable: launching a feature against an application should feel
  // like launching one against a regular repository.
  const effectiveInitialMode: BuildMode | undefined =
    isAppScoped && !initialMode ? BuildModeEnum.Spec : initialMode;
  const createSound = useSoundAction('create');
  const { t } = useTranslation('web');
  // Validate repositoryPath from URL against active repos — prevents stale URL params
  // from selecting deleted repos after add/delete/re-add cycles.
  // Trust the prop when: app-scoped (the application is the authority on its
  // own repo path, even if that path is not a registered Repository entity),
  // repos not loaded yet (undefined), empty list (no repos to check), or the
  // path matches an active repo.
  const validRepoPath = !repositoryPath
    ? ''
    : isAppScoped ||
        !repositories ||
        repositories.length === 0 ||
        repositories.some((r) => r.path === repositoryPath)
      ? repositoryPath
      : '';
  const defaultGates = workflowDefaults?.approvalGates ?? EMPTY_GATES;
  const defaultPush = workflowDefaults?.push ?? false;
  const defaultOpenPr = workflowDefaults?.openPr ?? false;
  const defaultCiWatch = workflowDefaults?.ciWatchEnabled !== false;
  const defaultEnableEvidence = workflowDefaults?.enableEvidence ?? false;
  const defaultCommitEvidence = workflowDefaults?.commitEvidence ?? false;
  const defaultMode = resolveInitialMode(effectiveInitialMode, workflowDefaults);

  const [description, setDescription] = useState(initialDescription ?? '');

  // Sync description when initialDescription prop changes (e.g. from session context)
  useEffect(() => {
    if (initialDescription) {
      setDescription(initialDescription);
    }
  }, [initialDescription]);

  const [attachments, setAttachments] = useState<FormAttachment[]>([]);
  const [approvalGates, setApprovalGates] = useState<Record<string, boolean>>({ ...defaultGates });
  const [push, setPush] = useState(defaultPush);
  const [openPr, setOpenPr] = useState(defaultOpenPr);
  const [ciWatchEnabled, setCiWatchEnabled] = useState(workflowDefaults?.ciWatchEnabled !== false);
  const [enableEvidence, setEnableEvidence] = useState(defaultEnableEvidence);
  const [commitEvidence, setCommitEvidence] = useState(defaultCommitEvidence);
  const [parentId, setParentId] = useState<string | undefined>(undefined);
  const [mode, setMode] = useState<BuildMode>(defaultMode);
  const fast = mode === BuildModeEnum.Fast;
  const [pending, setPending] = useState(false);
  const [forkAndPr, setForkAndPr] = useState(false);
  const [commitSpecs, setCommitSpecs] = useState(true);
  const [rebaseBeforeBranch, setRebaseBeforeBranch] = useState(true);
  const [injectSkills, setInjectSkills] = useState(workflowDefaults?.injectSkills ?? false);
  const [pluginOverrides, setPluginOverrides] = useState<Record<string, boolean>>(() => {
    const defaults: Record<string, boolean> = {};
    for (const p of installedPlugins ?? []) {
      defaults[p.name] = p.enabled;
    }
    return defaults;
  });
  const [overrideAgent, setOverrideAgent] = useState<string | undefined>(undefined);
  const [overrideModel, setOverrideModel] = useState<string | undefined>(undefined);
  const [selectedRepoPath, setSelectedRepoPath] = useState<string | undefined>(
    validRepoPath || undefined
  );
  const [localRepos, setLocalRepos] = useState<RepositoryOption[]>(repositories ?? []);
  const [isDragOver, setIsDragOver] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isPromptFocused, setIsPromptFocused] = useState(false);

  // Stable sessionId per mount — used for upload dedup grouping
  const sessionIdRef = useRef(crypto.randomUUID());
  const dragCounterRef = useRef(0);
  const promptContainerRef = useRef<HTMLDivElement>(null);

  // Sync state when workflowDefaults load asynchronously. Mode is only
  // re-synced from defaults when the caller did NOT pin an explicit
  // initialMode (or app-scoped Spec lock) — pinned modes win over async
  // defaults.
  useEffect(() => {
    if (workflowDefaults) {
      setApprovalGates({ ...workflowDefaults.approvalGates });
      setPush(workflowDefaults.push);
      setOpenPr(workflowDefaults.openPr);
      setCiWatchEnabled(workflowDefaults.ciWatchEnabled !== false);
      setEnableEvidence(workflowDefaults.enableEvidence);
      setCommitEvidence(workflowDefaults.commitEvidence);
      if (!effectiveInitialMode) {
        setMode((workflowDefaults.defaultMode as BuildMode | undefined) ?? BuildModeEnum.Fast);
      }
      setInjectSkills(workflowDefaults.injectSkills ?? false);
    }
  }, [workflowDefaults, effectiveInitialMode]);

  // Sync localRepos when repositories prop changes
  useEffect(() => {
    setLocalRepos(repositories ?? []);
  }, [repositories]);

  // Pre-select parent when initialParentId changes (e.g. (+) button on feature node)
  useEffect(() => {
    if (open && initialParentId) {
      setParentId(initialParentId);
    }
  }, [open, initialParentId]);

  // Permission-aware Fork & PR toggle visibility
  const [canPush, setCanPush] = useState(canPushDirectly ?? false);

  // Sync canPush from prop when it changes (e.g. initial server-side value)
  useEffect(() => {
    setCanPush(canPushDirectly ?? false);
  }, [canPushDirectly]);

  // Re-check permission when user switches repos via the combobox
  const prevRepoRef = useRef(selectedRepoPath);
  useEffect(() => {
    if (selectedRepoPath && selectedRepoPath !== prevRepoRef.current) {
      prevRepoRef.current = selectedRepoPath;
      getViewerPermission(selectedRepoPath)
        .then((result) => setCanPush(result.canPushDirectly))
        .catch(() => setCanPush(false));
    }
  }, [selectedRepoPath]);

  // Auto-reset forkAndPr and dependent states when canPush becomes true
  useEffect(() => {
    if (canPush) {
      setForkAndPr(false);
      setPush(defaultPush);
      setOpenPr(defaultOpenPr);
      setCommitSpecs(true);
    }
  }, [canPush, defaultPush, defaultOpenPr]);

  const resetForm = useCallback(() => {
    setDescription('');
    setAttachments([]);
    setApprovalGates({ ...defaultGates });
    setPush(defaultPush);
    setOpenPr(defaultOpenPr);
    setCiWatchEnabled(defaultCiWatch);
    setEnableEvidence(defaultEnableEvidence);
    setCommitEvidence(defaultCommitEvidence);
    setParentId(undefined);
    setSelectedRepoPath(validRepoPath || undefined);
    setLocalRepos(repositories ?? []);
    setMode(defaultMode);
    setPending(false);
    setForkAndPr(false);
    setCommitSpecs(true);
    setRebaseBeforeBranch(true);
    setOverrideAgent(undefined);
    setOverrideModel(undefined);
    setUploadError(null);
    dragCounterRef.current = 0;
    setIsDragOver(false);
  }, [
    defaultGates,
    defaultPush,
    defaultOpenPr,
    defaultEnableEvidence,
    defaultCiWatch,
    defaultCommitEvidence,
    defaultMode,
    validRepoPath,
    repositories,
  ]);

  // Track whether the form has unsaved data
  const isDirty = description.trim() !== '' || attachments.length > 0;

  // Shared close guard — shows confirmation when dirty, prevents navigation
  const { attemptClose } = useGuardedDrawerClose({ open, isDirty, onClose, onReset: resetForm });

  /** Validate and upload files from drop or paste. */
  const handleFiles = useCallback(async (fileList: File[]) => {
    setUploadError(null);

    for (const file of fileList) {
      // Client-side size validation
      if (file.size > MAX_FILE_SIZE) {
        setUploadError(`"${file.name}" exceeds 10 MB limit`);
        return;
      }
      // Client-side extension validation
      const ext = getExtension(file.name);
      if (ext && !ALLOWED_EXTENSIONS.has(ext)) {
        setUploadError(`File type "${ext}" is not allowed`);
        return;
      }
    }

    for (const file of fileList) {
      const tempId = crypto.randomUUID();

      // Optimistic loading placeholder
      setAttachments((prev) => [
        ...prev,
        {
          id: tempId,
          name: file.name,
          size: file.size,
          mimeType: file.type || 'application/octet-stream',
          path: '',
          loading: true,
        },
      ]);

      try {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('sessionId', sessionIdRef.current);

        const res = await fetch('/api/attachments/upload', {
          method: 'POST',
          body: formData,
        });

        if (!res.ok) {
          const body = await res.json().catch(() => ({ error: 'Upload failed' }));
          // Remove loading placeholder on error
          setAttachments((prev) => prev.filter((a) => a.id !== tempId));
          setUploadError(body.error ?? 'Upload failed');
          return;
        }

        const uploaded = await res.json();
        // Server dedup may return the same path for identical content — drop the duplicate.
        setAttachments((prev) => {
          const isDupe = prev.some((a) => a.id !== tempId && a.path === uploaded.path);
          if (isDupe) return prev.filter((a) => a.id !== tempId);
          return prev.map((a) =>
            a.id === tempId ? { ...uploaded, id: tempId, loading: false } : a
          );
        });
      } catch {
        setAttachments((prev) => prev.filter((a) => a.id !== tempId));
        setUploadError('Upload failed');
      }
    }
  }, []);

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current += 1;
    if (dragCounterRef.current === 1) {
      setIsDragOver(true);
    }
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current -= 1;
    if (dragCounterRef.current === 0) {
      setIsDragOver(false);
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      dragCounterRef.current = 0;
      setIsDragOver(false);

      const files = Array.from(e.dataTransfer.files);
      if (files.length > 0) {
        handleFiles(files);
      }
    },
    [handleFiles]
  );

  const handlePaste = useCallback(
    (e: React.ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;

      const files: File[] = [];
      for (const item of Array.from(items)) {
        if (item.kind === 'file') {
          const file = item.getAsFile();
          if (file) files.push(file);
        }
      }

      if (files.length > 0) {
        e.preventDefault();
        handleFiles(files);
      }
    },
    [handleFiles]
  );

  const handleSubmit = useCallback(
    (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      if (!description.trim()) return;
      const effectiveRepoPath = selectedRepoPath ?? validRepoPath;
      if (!effectiveRepoPath) return;
      createSound.play();
      onSubmit({
        description: description.trim(),
        attachments: attachments.filter((a) => !a.loading),
        repositoryPath: effectiveRepoPath,
        approvalGates: {
          allowPrd: approvalGates.allowPrd ?? false,
          allowPlan: approvalGates.allowPlan ?? false,
          allowMerge: approvalGates.allowMerge ?? false,
        },
        push: forkAndPr ? true : push || openPr,
        openPr: forkAndPr ? true : openPr,
        ciWatchEnabled,
        enableEvidence,
        commitEvidence,
        fast,
        forkAndPr,
        commitSpecs,
        rebaseBeforeBranch,
        injectSkills,
        ...(Object.keys(pluginOverrides).length > 0 ? { activePlugins: pluginOverrides } : {}),
        ...(pending ? { pending } : {}),
        ...(overrideAgent ? { agentType: overrideAgent } : {}),
        ...(overrideModel ? { model: overrideModel } : {}),
        ...(parentId ? { parentId } : {}),
        ...(initialApplicationId ? { applicationId: initialApplicationId } : {}),
        sessionId: sessionIdRef.current,
      });
      resetForm();
    },
    [
      description,
      attachments,
      approvalGates,
      selectedRepoPath,
      validRepoPath,
      onSubmit,
      push,
      openPr,
      enableEvidence,
      ciWatchEnabled,
      commitEvidence,
      fast,
      forkAndPr,
      commitSpecs,
      rebaseBeforeBranch,
      injectSkills,
      pluginOverrides,
      pending,
      overrideAgent,
      overrideModel,
      parentId,
      initialApplicationId,
      createSound,
      resetForm,
    ]
  );

  const handleAddFiles = useCallback(async () => {
    try {
      const files = await pickFiles();
      if (!files) return;

      for (const file of files) {
        const tempId = crypto.randomUUID();

        setAttachments((prev) => [
          ...prev,
          {
            id: tempId,
            name: file.name,
            size: file.size,
            mimeType: 'application/octet-stream',
            path: '',
            loading: true,
          },
        ]);

        try {
          const res = await fetch('/api/attachments/upload-from-path', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path: file.path, sessionId: sessionIdRef.current }),
          });

          if (!res.ok) {
            const body = await res.json().catch(() => ({ error: 'Upload failed' }));
            setAttachments((prev) => prev.filter((a) => a.id !== tempId));
            setUploadError(body.error ?? 'Upload failed');
            return;
          }

          const uploaded = await res.json();
          setAttachments((prev) => {
            const isDupe = prev.some((a) => a.id !== tempId && a.path === uploaded.path);
            if (isDupe) return prev.filter((a) => a.id !== tempId);
            return prev.map((a) =>
              a.id === tempId ? { ...uploaded, id: tempId, loading: false } : a
            );
          });
        } catch {
          setAttachments((prev) => prev.filter((a) => a.id !== tempId));
          setUploadError('Upload failed');
        }
      }
    } catch {
      // Native dialog failed — silently ignore (user can retry)
    }
  }, []);

  const handleRemoveFile = useCallback((id: string) => {
    setAttachments((prev) => prev.filter((f) => f.id !== id));
  }, []);

  const handleNotesChange = useCallback((id: string, notes: string) => {
    setAttachments((prev) => prev.map((f) => (f.id === id ? { ...f, notes } : f)));
  }, []);

  const formRef = useRef<HTMLFormElement>(null);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      formRef.current?.requestSubmit();
    }
  }, []);

  const handlePromptFocus = useCallback(() => {
    setIsPromptFocused(true);
  }, []);

  const handlePromptBlur = useCallback(() => {
    // Defer the check so focus has time to settle on the new target.
    // This correctly handles Radix portals (e.g. AgentModelPicker popover) that
    // render outside the container DOM but are logically part of the prompt area.
    setTimeout(() => {
      const withinContainer = promptContainerRef.current?.contains(document.activeElement);
      const pickerPopoverOpen =
        promptContainerRef.current?.querySelector('[aria-expanded="true"]') !== null;
      if (!withinContainer && !pickerPopoverOpen) {
        setIsPromptFocused(false);
      }
    }, 0);
  }, []);

  const hasFeatures = features && features.length > 0;
  const needsRepo = !validRepoPath && !selectedRepoPath;
  const showRepoSelector = !validRepoPath && repositories !== undefined;

  const AUTO_APPROVE_OPTIONS = [
    { id: 'allowPrd', label: t('createDrawer.prd'), description: t('createDrawer.prdDescription') },
    {
      id: 'allowPlan',
      label: t('createDrawer.plan'),
      description: t('createDrawer.planDescription'),
    },
    {
      id: 'allowMerge',
      label: t('createDrawer.merge'),
      description: t('createDrawer.mergeDescription'),
    },
  ];

  return (
    <BaseDrawer
      open={open}
      onClose={attemptClose}
      size="md"
      modal={false}
      dismissOnOutsideClick
      data-testid="feature-create-drawer"
      header={
        <>
          <div className="flex items-center gap-2">
            <div className="h-2.5 w-2.5 shrink-0 rounded-full bg-blue-500" />
            <DrawerTitle>{t('createDrawer.title')}</DrawerTitle>
          </div>
          {isSubmitting ? (
            <DrawerDescription asChild>
              <div>
                <Badge variant="secondary">{t('createDrawer.creating')}</Badge>
              </div>
            </DrawerDescription>
          ) : null}
        </>
      }
      footer={
        <div className="flex flex-row justify-end gap-2">
          <Button variant="outline" onClick={attemptClose} disabled={isSubmitting}>
            {t('createDrawer.cancel')}
          </Button>
          <Button
            type="submit"
            form="create-feature-form"
            disabled={!description.trim() || isSubmitting || needsRepo}
          >
            {isSubmitting ? t('createDrawer.creating') : t('createDrawer.createFeature')}
          </Button>
        </div>
      }
    >
      {/* Form body */}
      <div className="overflow-y-auto p-4">
        <TooltipProvider delayDuration={400}>
          <form
            ref={formRef}
            id="create-feature-form"
            onSubmit={handleSubmit}
            onKeyDown={handleKeyDown}
            className="flex flex-col gap-4"
          >
            {/* Repository selector (only when opened from sidebar without repo context) */}
            {isAppScoped ? (
              <div
                className="flex flex-col gap-1.5"
                data-testid="repo-readonly-section"
                data-locked-by-application="true"
              >
                <Label className="text-muted-foreground text-xs font-semibold tracking-wider">
                  {t('createDrawer.repository')}
                </Label>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <p
                      className="text-sm opacity-70"
                      data-testid="repo-readonly-label"
                      aria-disabled="true"
                      aria-describedby="locked-by-application-tooltip"
                      title={t('createDrawer.lockedByApplication')}
                    >
                      {repositories?.find((r) => r.path === validRepoPath)?.name ??
                        (validRepoPath ? validRepoPath.split('/').pop() : '') ??
                        validRepoPath}
                    </p>
                  </TooltipTrigger>
                  <TooltipContent id="locked-by-application-tooltip" role="tooltip" side="bottom">
                    {t('createDrawer.lockedByApplication')}
                  </TooltipContent>
                </Tooltip>
              </div>
            ) : showRepoSelector ? (
              <div className="flex flex-col gap-1.5" data-testid="repo-selector-section">
                <Label className="text-muted-foreground text-xs font-semibold tracking-wider">
                  {t('createDrawer.repository')}
                </Label>
                <RepositoryCombobox
                  repositories={localRepos}
                  value={selectedRepoPath}
                  onChange={setSelectedRepoPath}
                  onAddRepository={(repo) => {
                    setLocalRepos((prev) => [...prev, repo]);
                    setSelectedRepoPath(repo.path);
                  }}
                  disabled={isSubmitting}
                />
              </div>
            ) : validRepoPath ? (
              <div className="flex flex-col gap-1.5" data-testid="repo-readonly-section">
                <Label className="text-muted-foreground text-xs font-semibold tracking-wider">
                  {t('createDrawer.repository')}
                </Label>
                <p className="text-sm" data-testid="repo-readonly-label">
                  {repositories?.find((r) => r.path === validRepoPath)?.name ??
                    validRepoPath.split('/').pop()}
                </p>
              </div>
            ) : null}

            {/* Description + inline controls with drop zone */}
            <div
              role="region"
              aria-label={t('createDrawer.fileDropZone')}
              data-drag-over={isDragOver ? 'true' : 'false'}
              onDragEnter={handleDragEnter}
              onDragLeave={handleDragLeave}
              onDragOver={handleDragOver}
              onDrop={handleDrop}
              className={cn(
                'flex flex-col gap-1.5 rounded-md border-2 border-transparent p-1 transition-colors',
                isDragOver && 'border-primary/50 bg-primary/5'
              )}
            >
              <Label
                htmlFor="feature-description"
                className="text-muted-foreground text-xs font-semibold tracking-wider"
              >
                {t('createDrawer.describeFeature')}
              </Label>
              <div
                ref={promptContainerRef}
                onFocus={handlePromptFocus}
                onBlur={handlePromptBlur}
                className={cn(
                  'border-input flex h-56 flex-col overflow-hidden rounded-md border shadow-xs transition-[color,box-shadow]',
                  isPromptFocused && 'ring-ring/50 border-ring ring-[3px]'
                )}
              >
                <Textarea
                  id="feature-description"
                  placeholder={t('createDrawer.featurePlaceholder')}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  onPaste={handlePaste}
                  required
                  disabled={isSubmitting}
                  className="min-h-0 flex-1 resize-none rounded-none border-0 shadow-none focus-visible:ring-0"
                />
                {/* Inline attachment chips — between textarea and controls */}
                {attachments.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1.5 px-3 py-2">
                    {attachments.map((file) => (
                      <AttachmentChip
                        key={file.id}
                        name={file.name}
                        size={file.size}
                        mimeType={file.mimeType}
                        path={file.path}
                        onRemove={() => handleRemoveFile(file.id)}
                        disabled={isSubmitting}
                        loading={file.loading}
                        notes={file.notes}
                        onNotesChange={(notes) => handleNotesChange(file.id, notes)}
                      />
                    ))}
                  </div>
                )}
                {uploadError ? (
                  <p className="text-destructive px-3 pb-2 text-xs">{uploadError}</p>
                ) : null}
                <div className="border-input flex items-center gap-3 border-t px-3 py-1.5">
                  <AgentModelPicker
                    // No hardcoded `'claude-code'` fallback — `currentAgentType`
                    // already comes from the user's settings via the create
                    // drawer page's SSR pass (single source of truth). When
                    // settings is absent (impossible in practice but kept
                    // defensive), the picker shows an empty label and the
                    // user can pick an agent explicitly.
                    initialAgentType={overrideAgent ?? currentAgentType ?? ''}
                    initialModel={overrideModel ?? currentModel ?? ''}
                    mode="override"
                    onAgentModelChange={(agent, model) => {
                      setOverrideAgent(agent);
                      setOverrideModel(model);
                    }}
                    disabled={isSubmitting}
                    className="w-55"
                  />
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className="ml-auto flex cursor-pointer items-center gap-2">
                        <Switch
                          id="pending-mode"
                          checked={pending}
                          onCheckedChange={setPending}
                          disabled={isSubmitting}
                        />
                        <Label
                          htmlFor="pending-mode"
                          className="flex cursor-pointer items-center gap-1 text-sm font-medium"
                        >
                          <Clock className="h-3.5 w-3.5" />
                          {t('createDrawer.pendingMode')}
                        </Label>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent side="bottom">
                      {t('createDrawer.pendingModeDescription')}
                    </TooltipContent>
                  </Tooltip>
                  <div
                    role="group"
                    aria-label={t('createDrawer.modeGroupLabel')}
                    className="border-input flex items-center gap-0.5 rounded-md border p-0.5"
                  >
                    {BUILD_MODE_ORDER.map((m) => {
                      const meta = BUILD_MODE_META[m];
                      const Icon = meta.icon;
                      const isActive = mode === m;
                      return (
                        <Tooltip key={m}>
                          <TooltipTrigger asChild>
                            <button
                              type="button"
                              data-testid={`build-mode-${m}`}
                              aria-pressed={isActive}
                              aria-disabled={isSubmitting}
                              disabled={isSubmitting}
                              onClick={() => setMode(m)}
                              className={cn(
                                'flex cursor-pointer items-center gap-1 rounded-sm px-2 py-1 text-xs font-medium transition-colors',
                                isActive
                                  ? 'bg-accent text-foreground'
                                  : 'text-muted-foreground hover:text-foreground',
                                'disabled:cursor-not-allowed disabled:opacity-50'
                              )}
                            >
                              <Icon className="h-3.5 w-3.5" />
                              {t(meta.labelKey)}
                            </button>
                          </TooltipTrigger>
                          <TooltipContent role="tooltip" side="bottom">
                            {t(`${meta.labelKey}Description`)}
                          </TooltipContent>
                        </Tooltip>
                      );
                    })}
                  </div>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        onClick={handleAddFiles}
                        disabled={isSubmitting}
                        aria-label={t('chat.attachFiles')}
                        className="text-muted-foreground hover:text-foreground cursor-pointer rounded p-1 transition-colors"
                      >
                        <PaperclipIcon className="h-4 w-4" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom">{t('chat.attachFiles')}</TooltipContent>
                  </Tooltip>
                </div>
              </div>
            </div>

            {/* Parent feature selector (only when opened from a feature node) */}
            {hasFeatures && initialParentId !== undefined ? (
              <div className="flex flex-col gap-1.5">
                <Label
                  htmlFor="parent-feature"
                  className="text-muted-foreground text-xs font-semibold tracking-wider"
                >
                  {t('createDrawer.parentFeature')}
                </Label>
                <ParentFeatureCombobox
                  features={features}
                  value={parentId}
                  onChange={setParentId}
                  disabled={isSubmitting}
                />
              </div>
            ) : null}

            {/* Approve + Git — compact switch groups */}
            <div className="flex flex-col gap-2">
              {/* Approve row */}
              <div className="border-input flex items-center gap-4 rounded-md border px-3 py-2.5">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="text-muted-foreground w-16 shrink-0 cursor-default text-xs font-semibold tracking-wider">
                      {t('createDrawer.approve')}
                    </span>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">
                    {t('createDrawer.approveDescription')}
                  </TooltipContent>
                </Tooltip>
                <div className="flex flex-1 items-center gap-4">
                  {AUTO_APPROVE_OPTIONS.map((opt) => (
                    <Tooltip key={opt.id}>
                      <TooltipTrigger asChild>
                        <div className="flex cursor-pointer items-center gap-1.5">
                          <Switch
                            id={`approve-${opt.id}`}
                            size="sm"
                            checked={approvalGates[opt.id] ?? false}
                            onCheckedChange={(v) =>
                              setApprovalGates((prev) => ({ ...prev, [opt.id]: v }))
                            }
                            disabled={
                              isSubmitting ||
                              (fast && (opt.id === 'allowPrd' || opt.id === 'allowPlan'))
                            }
                          />
                          <Label
                            htmlFor={`approve-${opt.id}`}
                            className="cursor-pointer text-xs font-medium"
                          >
                            {opt.label}
                          </Label>
                        </div>
                      </TooltipTrigger>
                      <TooltipContent side="bottom">
                        {fast && (opt.id === 'allowPrd' || opt.id === 'allowPlan')
                          ? t('createDrawer.skippedInFastMode')
                          : opt.description}
                      </TooltipContent>
                    </Tooltip>
                  ))}
                </div>
                {/* Select all shortcut */}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      onClick={() => {
                        const allOn = AUTO_APPROVE_OPTIONS.every((o) => approvalGates[o.id]);
                        const next: Record<string, boolean> = {};
                        for (const o of AUTO_APPROVE_OPTIONS) next[o.id] = !allOn;
                        setApprovalGates(next);
                      }}
                      disabled={isSubmitting}
                      className={cn(
                        'text-muted-foreground hover:text-foreground cursor-pointer rounded px-1.5 py-0.5 text-[10px] font-semibold tracking-wider uppercase transition-colors',
                        AUTO_APPROVE_OPTIONS.every((o) => approvalGates[o.id]) && 'text-primary'
                      )}
                    >
                      {t('createDrawer.all')}
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">
                    {t('createDrawer.toggleAllApprovalGates')}
                  </TooltipContent>
                </Tooltip>
              </div>

              {/* Evidence row */}
              <div className="border-input flex items-center gap-4 rounded-md border px-3 py-2.5">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="text-muted-foreground w-16 shrink-0 cursor-default text-xs font-semibold tracking-wider">
                      {t('createDrawer.evidence')}
                    </span>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">
                    {t('createDrawer.evidenceDescription')}
                  </TooltipContent>
                </Tooltip>
                <div className="flex flex-1 items-center gap-4">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className="flex cursor-pointer items-center gap-1.5">
                        <Switch
                          id="enable-evidence"
                          size="sm"
                          checked={enableEvidence}
                          onCheckedChange={(v) => {
                            setEnableEvidence(v);
                            if (!v) setCommitEvidence(false);
                          }}
                          disabled={isSubmitting}
                        />
                        <Label
                          htmlFor="enable-evidence"
                          className="cursor-pointer text-xs font-medium"
                        >
                          {t('createDrawer.collect')}
                        </Label>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent side="bottom">
                      {t('createDrawer.collectDescription')}
                    </TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className="flex cursor-pointer items-center gap-1.5">
                        <Switch
                          id="commit-evidence"
                          size="sm"
                          checked={commitEvidence}
                          onCheckedChange={setCommitEvidence}
                          disabled={isSubmitting || !enableEvidence || (!openPr && !forkAndPr)}
                        />
                        <Label
                          htmlFor="commit-evidence"
                          className={cn(
                            'cursor-pointer text-xs font-medium',
                            (!enableEvidence || (!openPr && !forkAndPr)) && 'opacity-50'
                          )}
                        >
                          {t('createDrawer.addToPr')}
                        </Label>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent side="bottom">
                      {!openPr && !forkAndPr
                        ? t('createDrawer.requiresPr')
                        : !enableEvidence
                          ? t('createDrawer.requiresEvidence')
                          : t('createDrawer.addToPrDescription')}
                    </TooltipContent>
                  </Tooltip>
                </div>
              </div>

              {/* Skills row */}
              <div className="border-input flex items-center gap-4 rounded-md border px-3 py-2.5">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="text-muted-foreground w-16 shrink-0 cursor-default text-xs font-semibold tracking-wider">
                      {t('createDrawer.skills')}
                    </span>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">
                    {t('createDrawer.skillsDescription')}
                  </TooltipContent>
                </Tooltip>
                <div className="flex flex-1 items-center gap-4">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className="flex cursor-pointer items-center gap-1.5">
                        <Switch
                          id="inject-skills"
                          size="sm"
                          checked={injectSkills}
                          onCheckedChange={setInjectSkills}
                          disabled={isSubmitting}
                        />
                        <Label
                          htmlFor="inject-skills"
                          className="flex cursor-pointer items-center gap-1 text-xs font-medium"
                        >
                          <Puzzle className="h-3 w-3" />
                          {t('createDrawer.injectSkills')}
                        </Label>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent side="bottom">
                      {t('createDrawer.injectSkillsDescription')}
                    </TooltipContent>
                  </Tooltip>
                </div>
              </div>

              {/* Plugins row */}
              {installedPlugins && installedPlugins.length > 0 ? (
                <div className="border-input flex items-start gap-4 rounded-md border px-3 py-2.5">
                  <span className="text-muted-foreground w-16 shrink-0 pt-0.5 text-xs font-semibold tracking-wider">
                    PLUGINS
                  </span>
                  <div className="flex flex-1 flex-wrap items-center gap-4">
                    {installedPlugins.map((plugin) => (
                      <Tooltip key={plugin.name}>
                        <TooltipTrigger asChild>
                          <div className="flex cursor-pointer items-center gap-1.5">
                            <Switch
                              id={`plugin-${plugin.name}`}
                              size="sm"
                              checked={pluginOverrides[plugin.name] ?? plugin.enabled}
                              onCheckedChange={(checked) =>
                                setPluginOverrides((prev) => ({
                                  ...prev,
                                  [plugin.name]: checked,
                                }))
                              }
                              disabled={isSubmitting}
                            />
                            <Label
                              htmlFor={`plugin-${plugin.name}`}
                              className="flex cursor-pointer items-center gap-1 text-xs font-medium"
                            >
                              <Plug className="h-3 w-3" />
                              {plugin.displayName}
                            </Label>
                          </div>
                        </TooltipTrigger>
                        <TooltipContent side="bottom">
                          {`${(pluginOverrides[plugin.name] ?? plugin.enabled) ? 'Disable' : 'Enable'} ${plugin.displayName} for this feature`}
                        </TooltipContent>
                      </Tooltip>
                    ))}
                  </div>
                </div>
              ) : null}

              {/* Git row */}
              <div className="border-input flex items-start gap-4 rounded-md border px-3 py-2.5">
                <span className="text-muted-foreground w-16 shrink-0 pt-0.5 text-xs font-semibold tracking-wider">
                  {t('createDrawer.git')}
                </span>
                <div className="flex flex-1 flex-wrap items-center gap-4">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className="flex cursor-pointer items-center gap-1.5">
                        <Switch
                          id="push"
                          size="sm"
                          checked={forkAndPr ? true : push || openPr}
                          onCheckedChange={(v) => {
                            setPush(v);
                            if (!v && openPr) setOpenPr(false);
                          }}
                          disabled={isSubmitting || forkAndPr}
                        />
                        <Label
                          htmlFor="push"
                          className={cn(
                            'cursor-pointer text-xs font-medium',
                            forkAndPr && 'opacity-50'
                          )}
                        >
                          {t('createDrawer.push')}
                        </Label>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent side="bottom">
                      {forkAndPr
                        ? 'Enabled — contributing to upstream'
                        : t('createDrawer.pushDescription')}
                    </TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className="flex cursor-pointer items-center gap-1.5">
                        <Switch
                          id="open-pr"
                          size="sm"
                          checked={forkAndPr ? true : openPr}
                          onCheckedChange={(v) => {
                            setOpenPr(v);
                            if (!v) setCommitEvidence(false);
                          }}
                          disabled={isSubmitting || forkAndPr}
                        />
                        <Label
                          htmlFor="open-pr"
                          className={cn(
                            'cursor-pointer text-xs font-medium',
                            forkAndPr && 'opacity-50'
                          )}
                        >
                          {t('createDrawer.pr')}
                        </Label>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent side="bottom">
                      {forkAndPr
                        ? 'Enabled — contributing to upstream'
                        : t('createDrawer.prDescription')}
                    </TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className="flex cursor-pointer items-center gap-1.5">
                        <Switch
                          id="ci-watch"
                          size="sm"
                          checked={ciWatchEnabled}
                          onCheckedChange={setCiWatchEnabled}
                          disabled={isSubmitting}
                        />
                        <Label htmlFor="ci-watch" className="cursor-pointer text-xs font-medium">
                          {t('createDrawer.watch')}
                        </Label>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent side="bottom">
                      {t('createDrawer.watchDescription')}
                    </TooltipContent>
                  </Tooltip>
                  {/* Separator between standard git and repo options */}
                  <div className="bg-border h-4 w-px shrink-0" />
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className="flex cursor-pointer items-center gap-1.5">
                        <Switch
                          id="rebase-before-branch"
                          size="sm"
                          checked={rebaseBeforeBranch}
                          onCheckedChange={setRebaseBeforeBranch}
                          disabled={isSubmitting}
                        />
                        <Label
                          htmlFor="rebase-before-branch"
                          className="flex cursor-pointer items-center gap-1 text-xs font-medium"
                        >
                          <RefreshCw className="h-3 w-3" />
                          {t('createDrawer.sync')}
                        </Label>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent side="bottom">
                      {t('createDrawer.syncDescription')}
                    </TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className="flex cursor-pointer items-center gap-1.5">
                        <Switch
                          id="commit-specs"
                          size="sm"
                          checked={commitSpecs}
                          onCheckedChange={setCommitSpecs}
                          disabled={isSubmitting}
                        />
                        <Label
                          htmlFor="commit-specs"
                          className="flex cursor-pointer items-center gap-1 text-xs font-medium"
                        >
                          <FileText className="h-3 w-3" />
                          {t('createDrawer.commitSpecs')}
                        </Label>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent side="bottom">
                      {t('createDrawer.commitSpecsDescription')}
                    </TooltipContent>
                  </Tooltip>
                  {!canPush && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div className="flex cursor-pointer items-center gap-1.5">
                          <Switch
                            id="fork-and-pr"
                            size="sm"
                            checked={forkAndPr}
                            onCheckedChange={(v) => {
                              setForkAndPr(v);
                              // Auto-flip commitSpecs to false when enabling contribute mode
                              if (v) setCommitSpecs(false);
                            }}
                            disabled={isSubmitting}
                          />
                          <Label
                            htmlFor="fork-and-pr"
                            className="flex cursor-pointer items-center gap-1 text-xs font-medium"
                          >
                            <GitFork className="h-3 w-3" />
                            {t('createDrawer.forkAndPr')}
                          </Label>
                        </div>
                      </TooltipTrigger>
                      <TooltipContent side="bottom">
                        {t('createDrawer.forkAndPrDescription')}
                      </TooltipContent>
                    </Tooltip>
                  )}
                </div>
              </div>
            </div>
          </form>
        </TooltipProvider>
      </div>
    </BaseDrawer>
  );
}

/* ---------------------------------------------------------------------------
 * ParentFeatureCombobox — searchable dropdown for parent feature selection
 * ------------------------------------------------------------------------- */

interface ParentFeatureComboboxProps {
  features: ParentFeatureOption[];
  value: string | undefined;
  onChange: (id: string | undefined) => void;
  disabled?: boolean;
}

function ParentFeatureCombobox({
  features,
  value,
  onChange,
  disabled,
}: ParentFeatureComboboxProps) {
  const { t } = useTranslation('web');
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const selectedFeature = features.find((f) => f.id === value);

  const filtered = query.trim()
    ? features.filter(
        (f) =>
          f.name.toLowerCase().includes(query.toLowerCase()) ||
          f.id.toLowerCase().includes(query.toLowerCase())
      )
    : features;

  const handleSelect = useCallback(
    (id: string | undefined) => {
      onChange(id);
      setOpen(false);
      setQuery('');
    },
    [onChange]
  );

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 0);
    } else {
      setQuery('');
    }
  }, [open]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          id="parent-feature"
          type="button"
          role="combobox"
          aria-expanded={open}
          aria-label="Parent Feature"
          disabled={disabled}
          data-testid="parent-feature-combobox"
          className={cn(
            'border-input bg-background ring-offset-background focus:ring-ring flex h-9 w-full items-center justify-between rounded-md border px-3 py-2 text-sm focus:ring-2 focus:ring-offset-2 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50',
            !selectedFeature && 'text-muted-foreground'
          )}
        >
          <span className="truncate">
            {selectedFeature
              ? `${selectedFeature.name} (${selectedFeature.id.slice(0, 8)})`
              : t('createDrawer.selectParent')}
          </span>
          <ChevronsUpDown className="ms-2 h-4 w-4 shrink-0 opacity-50" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="w-80 p-0"
        align="start"
        data-testid="parent-feature-combobox-content"
      >
        <div className="flex flex-col">
          {/* Search input */}
          <div className="border-b p-2">
            <Input
              ref={inputRef}
              placeholder={t('createDrawer.searchFeatures')}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="h-8 border-0 p-0 text-sm shadow-none focus-visible:ring-0"
              data-testid="parent-feature-search"
            />
          </div>

          {/* Options list */}
          <div className="max-h-48 overflow-y-auto py-1" role="listbox" aria-label="Features">
            {/* No parent option */}
            <button
              type="button"
              role="option"
              aria-selected={value === undefined}
              onClick={() => handleSelect(undefined)}
              className={cn(
                'hover:bg-accent hover:text-accent-foreground flex w-full items-center gap-2 px-3 py-2 text-sm',
                value === undefined && 'bg-accent/50'
              )}
              data-testid="parent-feature-option-none"
            >
              <CheckIcon className={cn('h-4 w-4 shrink-0', value !== undefined && 'invisible')} />
              <span className="text-muted-foreground italic">{t('createDrawer.noParent')}</span>
            </button>

            {filtered.length === 0 && query ? (
              <p className="text-muted-foreground px-3 py-2 text-sm">
                {t('createDrawer.noFeaturesFound')}
              </p>
            ) : (
              filtered.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  role="option"
                  aria-selected={value === f.id}
                  onClick={() => handleSelect(f.id)}
                  className={cn(
                    'hover:bg-accent hover:text-accent-foreground flex w-full items-center gap-2 px-3 py-2 text-sm',
                    value === f.id && 'bg-accent/50'
                  )}
                  data-testid={`parent-feature-option-${f.id}`}
                >
                  <CheckIcon className={cn('h-4 w-4 shrink-0', value !== f.id && 'invisible')} />
                  <span className="truncate">
                    {f.name}{' '}
                    <span className="text-muted-foreground font-mono text-xs">
                      ({f.id.slice(0, 8)})
                    </span>
                  </span>
                </button>
              ))
            )}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

/* ---------------------------------------------------------------------------
 * RepositoryCombobox — searchable dropdown for repository selection
 * ------------------------------------------------------------------------- */

export interface RepositoryComboboxProps {
  repositories: RepositoryOption[];
  value: string | undefined;
  onChange: (path: string | undefined) => void;
  onAddRepository?: (repo: RepositoryOption) => void;
  disabled?: boolean;
}

export function RepositoryCombobox({
  repositories,
  value,
  onChange,
  onAddRepository,
  disabled,
}: RepositoryComboboxProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [showReactPicker, setShowReactPicker] = useState(false);
  const [showGitHubImport, setShowGitHubImport] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const { reactFileManager: useReactFileManager, githubImport } = useFeatureFlags();
  const { t } = useTranslation('web');

  const selectedRepo = repositories.find((r) => r.path === value);

  const filtered = query.trim()
    ? repositories.filter(
        (r) =>
          r.name.toLowerCase().includes(query.toLowerCase()) ||
          r.path.toLowerCase().includes(query.toLowerCase())
      )
    : repositories;

  const handleSelect = useCallback(
    (path: string | undefined) => {
      onChange(path);
      setOpen(false);
      setQuery('');
    },
    [onChange]
  );

  const addRepoFromPath = useCallback(
    async (folderPath: string) => {
      const result = await addRepository({ path: folderPath });
      if (result.error) {
        setAddError(result.error);
        setIsAdding(false);
        return;
      }
      if (result.repository) {
        const newRepo: RepositoryOption = {
          id: result.repository.id,
          name: result.repository.name,
          path: result.repository.path,
        };
        onAddRepository?.(newRepo);
        onChange(newRepo.path);
        setOpen(false);
        setQuery('');
      }
    },
    [onAddRepository, onChange]
  );

  const handleAddRepository = useCallback(async () => {
    if (isAdding) return;

    if (useReactFileManager) {
      setShowReactPicker(true);
      return;
    }

    setIsAdding(true);
    setAddError(null);
    try {
      const folderPath = await pickFolder();
      if (!folderPath) {
        setIsAdding(false);
        return;
      }
      await addRepoFromPath(folderPath);
    } catch {
      // Native picker failed — fall back to React file manager
      setShowReactPicker(true);
    } finally {
      setIsAdding(false);
    }
  }, [isAdding, useReactFileManager, addRepoFromPath]);

  const handleGitHubImportComplete = useCallback(
    (repository: Repository) => {
      const newRepo: RepositoryOption = {
        id: repository.id,
        name: repository.name,
        path: repository.path,
        isFork: repository.isFork,
        upstreamUrl: repository.upstreamUrl,
      };
      onAddRepository?.(newRepo);
      onChange(newRepo.path);
      setOpen(false);
      setQuery('');
      setShowGitHubImport(false);
    },
    [onAddRepository, onChange]
  );

  const handleReactPickerSelect = useCallback(
    async (path: string | null) => {
      setShowReactPicker(false);
      if (!path) return;
      setIsAdding(true);
      setAddError(null);
      try {
        await addRepoFromPath(path);
      } catch (err: unknown) {
        setAddError(err instanceof Error ? err.message : 'Failed to add repository');
      } finally {
        setIsAdding(false);
      }
    },
    [addRepoFromPath]
  );

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 0);
    } else {
      setQuery('');
    }
  }, [open]);

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            role="combobox"
            aria-expanded={open}
            aria-label="Repository"
            disabled={disabled}
            data-testid="repository-combobox"
            className={cn(
              'border-input bg-background ring-offset-background focus:ring-ring flex h-9 w-full items-center justify-between rounded-md border px-3 py-2 text-sm focus:ring-2 focus:ring-offset-2 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50',
              !selectedRepo && 'text-muted-foreground'
            )}
          >
            <span className="flex items-center gap-1.5 truncate">
              <span className="truncate">
                {selectedRepo ? selectedRepo.name : 'Select repository...'}
              </span>
              {selectedRepo?.isFork ? (
                <span
                  className="bg-muted text-muted-foreground shrink-0 rounded px-1 py-0.5 text-[10px] font-medium"
                  title={
                    selectedRepo.upstreamUrl
                      ? `Fork of ${selectedRepo.upstreamUrl.replace('https://github.com/', '')}`
                      : 'Forked repository'
                  }
                >
                  Fork
                </span>
              ) : null}
            </span>
            <ChevronsUpDown className="ms-2 h-4 w-4 shrink-0 opacity-50" />
          </button>
        </PopoverTrigger>
        <PopoverContent
          className="w-80 p-0"
          align="start"
          data-testid="repository-combobox-content"
        >
          <div className="flex flex-col">
            {/* Search input */}
            <div className="border-b p-2">
              <Input
                ref={inputRef}
                placeholder={t('createDrawer.searchRepositories')}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="h-8 border-0 p-0 text-sm shadow-none focus-visible:ring-0"
                data-testid="repository-search"
              />
            </div>

            {/* Options list */}
            <div className="max-h-48 overflow-y-auto py-1" role="listbox" aria-label="Repositories">
              {filtered.length === 0 ? (
                <p
                  className="text-muted-foreground px-3 py-2 text-sm"
                  data-testid="repository-empty"
                >
                  No repositories found.
                </p>
              ) : (
                filtered.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    role="option"
                    aria-selected={value === r.path}
                    onClick={() => handleSelect(r.path)}
                    className={cn(
                      'hover:bg-accent hover:text-accent-foreground flex w-full items-center gap-2 px-3 py-2 text-sm',
                      value === r.path && 'bg-accent/50'
                    )}
                    data-testid={`repository-option-${r.id}`}
                  >
                    <CheckIcon
                      className={cn('h-4 w-4 shrink-0', value !== r.path && 'invisible')}
                    />
                    <span className="flex flex-col items-start truncate">
                      <span className="flex items-center gap-1.5 truncate">
                        {r.name}
                        {r.isFork ? (
                          <Badge variant="outline" className="h-4 shrink-0 px-1 text-[10px]">
                            <GitFork className="mr-0.5 h-2.5 w-2.5" />
                            Fork
                          </Badge>
                        ) : null}
                      </span>
                      <span className="text-muted-foreground truncate text-xs">{r.path}</span>
                    </span>
                  </button>
                ))
              )}
            </div>

            {/* Actions — pinned outside scroll area */}
            <Separator />
            {githubImport ? (
              <button
                type="button"
                onClick={() => setShowGitHubImport(true)}
                className="hover:bg-accent hover:text-accent-foreground flex w-full items-center gap-2 px-3 py-2 text-sm"
                data-testid="import-github-item"
              >
                <Github className="h-4 w-4 shrink-0" />
                <span>Import from GitHub...</span>
              </button>
            ) : null}
            <button
              type="button"
              onClick={handleAddRepository}
              disabled={isAdding}
              className="hover:bg-accent hover:text-accent-foreground flex w-full items-center gap-2 px-3 py-2 text-sm"
              data-testid="add-repository-item"
            >
              {isAdding ? (
                <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
              ) : (
                <FolderPlus className="h-4 w-4 shrink-0" />
              )}
              <span>Add new repository...</span>
            </button>
            {addError ? (
              <p className="px-3 pb-2 text-xs text-red-500" data-testid="add-repository-error">
                {addError}
              </p>
            ) : null}
          </div>
        </PopoverContent>
      </Popover>
      <ReactFileManagerDialog
        open={showReactPicker}
        onOpenChange={(isOpen) => {
          if (!isOpen) setShowReactPicker(false);
        }}
        onSelect={handleReactPickerSelect}
      />
      <GitHubImportDialog
        open={showGitHubImport}
        onOpenChange={setShowGitHubImport}
        onImportComplete={handleGitHubImportComplete}
      />
    </>
  );
}
