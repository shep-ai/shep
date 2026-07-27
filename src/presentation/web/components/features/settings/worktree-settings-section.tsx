'use client';

import { useState, useTransition, useRef, useEffect } from 'react';
import { FolderGit2, Check } from 'lucide-react';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { updateSettingsAction } from '@/app/actions/update-settings';
import type { WorktreeConfig } from '@shepai/core/domain/generated/output';
import { DEFAULT_WORKTREE_COMMAND_TIMEOUT_MS } from '@shepai/core/domain/shared/worktree-config';

export interface WorktreeSettingsSectionProps {
  worktree?: WorktreeConfig;
}

/**
 * Custom worktree provisioning settings.
 *
 * Lets the user replace `git worktree add` with their own tool and/or run a
 * setup command inside each new worktree (symlinking `node_modules` in a
 * monorepo, copying untracked config, warming caches).
 *
 * Commands are saved on blur so a half-typed command line is never persisted.
 */
export function WorktreeSettingsSection({ worktree }: WorktreeSettingsSectionProps) {
  const { t } = useTranslation('web');
  const [createCommand, setCreateCommand] = useState(worktree?.createCommand ?? '');
  const [postCreateCommand, setPostCreateCommand] = useState(worktree?.postCreateCommand ?? '');
  const [timeoutMs, setTimeoutMs] = useState(
    String(worktree?.commandTimeoutMs ?? DEFAULT_WORKTREE_COMMAND_TIMEOUT_MS)
  );
  const [isPending, startTransition] = useTransition();
  const [showSaved, setShowSaved] = useState(false);
  const prevPendingRef = useRef(false);

  useEffect(() => {
    if (prevPendingRef.current && !isPending) {
      setShowSaved(true);
      const timer = setTimeout(() => setShowSaved(false), 2000);
      return () => clearTimeout(timer);
    }
    prevPendingRef.current = isPending;
  }, [isPending]);

  function save(payload: Partial<WorktreeConfig>) {
    startTransition(async () => {
      const result = await updateSettingsAction({ worktree: payload });
      if (!result.success) {
        toast.error(result.error ?? t('settings.failedToSave'));
      }
    });
  }

  function saveCreateCommand() {
    if ((worktree?.createCommand ?? '') === createCommand) return;
    save({ createCommand });
  }

  function savePostCreateCommand() {
    if ((worktree?.postCreateCommand ?? '') === postCreateCommand) return;
    save({ postCreateCommand });
  }

  function saveTimeout() {
    const parsed = Number.parseInt(timeoutMs, 10);
    const next =
      Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_WORKTREE_COMMAND_TIMEOUT_MS;
    setTimeoutMs(String(next));
    if ((worktree?.commandTimeoutMs ?? DEFAULT_WORKTREE_COMMAND_TIMEOUT_MS) === next) return;
    save({ commandTimeoutMs: next });
  }

  return (
    <div className="bg-background rounded-lg border" data-testid="worktree-settings-section">
      <div className="bg-muted/30 border-b px-4 py-3">
        <div className="flex items-center gap-2">
          <FolderGit2 className="text-muted-foreground h-3.5 w-3.5" />
          <h2 className="text-sm font-semibold">{t('settings.worktree.title')}</h2>
          {isPending ? (
            <span className="text-muted-foreground text-xs">{t('settings.saving')}</span>
          ) : null}
          {showSaved && !isPending ? (
            <span className="flex items-center gap-1 text-xs text-green-600">
              <Check className="h-3 w-3" />
              {t('settings.saved')}
            </span>
          ) : null}
        </div>
        <p className="text-muted-foreground mt-0.5 text-[11px]">
          {t('settings.worktree.description')}
        </p>
      </div>

      <div className="space-y-3 px-4 py-3">
        <div className="space-y-1">
          <label htmlFor="worktree-create-command" className="text-sm font-normal">
            {t('settings.worktree.createCommand')}
          </label>
          <p className="text-muted-foreground text-[11px] leading-tight">
            {t('settings.worktree.createCommandDescription')}
          </p>
          <Textarea
            id="worktree-create-command"
            data-testid="worktree-create-command"
            rows={2}
            spellCheck={false}
            className="font-mono text-xs"
            placeholder={t('settings.worktree.createCommandPlaceholder')}
            value={createCommand}
            onChange={(e) => setCreateCommand(e.target.value)}
            onBlur={saveCreateCommand}
          />
        </div>

        <div className="space-y-1">
          <label htmlFor="worktree-post-create-command" className="text-sm font-normal">
            {t('settings.worktree.postCreateCommand')}
          </label>
          <p className="text-muted-foreground text-[11px] leading-tight">
            {t('settings.worktree.postCreateCommandDescription')}
          </p>
          <Textarea
            id="worktree-post-create-command"
            data-testid="worktree-post-create-command"
            rows={2}
            spellCheck={false}
            className="font-mono text-xs"
            placeholder={t('settings.worktree.postCreateCommandPlaceholder')}
            value={postCreateCommand}
            onChange={(e) => setPostCreateCommand(e.target.value)}
            onBlur={savePostCreateCommand}
          />
        </div>

        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0">
            <label htmlFor="worktree-command-timeout" className="text-sm font-normal">
              {t('settings.worktree.commandTimeout')}
            </label>
            <p className="text-muted-foreground text-[11px] leading-tight">
              {t('settings.worktree.commandTimeoutDescription')}
            </p>
          </div>
          <Input
            id="worktree-command-timeout"
            data-testid="worktree-command-timeout"
            type="number"
            min={1}
            className="w-32 text-xs"
            value={timeoutMs}
            onChange={(e) => setTimeoutMs(e.target.value)}
            onBlur={saveTimeout}
          />
        </div>

        <p className="text-muted-foreground text-[11px] leading-relaxed">
          {t('settings.worktree.envVarsHint')}
        </p>
      </div>
    </div>
  );
}
