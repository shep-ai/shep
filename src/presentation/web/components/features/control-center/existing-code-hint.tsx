'use client';

import { FolderGit2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export interface ExistingCodeHintProps {
  /** Folder the prompt refers to, exactly as typed. */
  path: string;
  /** Opens the folder as a repository and starts a feature there. Omit to show guidance only. */
  onOpen?: () => void;
  className?: string;
}

/**
 * Shown under the "start from a prompt" composer when the prompt names a
 * folder that already exists. The composer always creates a NEW empty
 * project, so without this hint the path is silently ignored.
 */
export function ExistingCodeHint({ path, onOpen, className }: ExistingCodeHintProps) {
  const { t } = useTranslation('web');

  return (
    <div
      data-testid="existing-code-hint"
      role="note"
      className={cn(
        'flex flex-col gap-2 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 sm:flex-row sm:items-center dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200',
        className
      )}
    >
      <FolderGit2 className="h-4 w-4 shrink-0" aria-hidden="true" />
      <p className="min-w-0 flex-1 leading-snug">
        {t(
          'emptyState.existingFolder.body',
          'Your prompt mentions {{path}}. A new project starts empty and will not look inside that folder.',
          { path }
        )}{' '}
        {onOpen
          ? null
          : t(
              'emptyState.existingFolder.fallback',
              'To continue existing code, open that folder as a project instead.'
            )}
      </p>
      {onOpen ? (
        <Button type="button" size="sm" variant="outline" className="shrink-0" onClick={onOpen}>
          {t('emptyState.existingFolder.action', 'Work on this folder instead')}
        </Button>
      ) : null}
    </div>
  );
}
