'use client';

/**
 * Per-repository action menu for the session-tree sub-nav.
 *
 * Action parity with the canvas repository card is the whole point: the tree is
 * the other way into the same repositories, so both surfaces read their list
 * from `useRepositoryCardActions`. The row is 288px wide, so the tree renders
 * them as a labelled dropdown rather than the canvas's icon toolbar.
 */

import { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, MoreHorizontal } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { deleteRepository } from '@/app/actions/delete-repository';
import { useRepositoryCardActions } from '@/components/common/repository-node/use-repository-card-actions';
import { RepositoryDeleteDialog } from '@/components/common/repository-node/repository-delete-dialog';
import {
  RepositoryActionKey,
  RepositoryActionTone,
  type RepositoryAction,
} from '@/components/common/repository-node/repository-actions';
import type { SessionTreeRepository } from '@shepai/core/application/use-cases/agents/build-session-tree.use-case';

/**
 * Actions that take the user somewhere else (or open a dialog) dismiss the
 * menu. The rest resolve in place and report their own loading/error state, so
 * closing the menu would hide the only feedback they produce.
 */
const DISMISSING_ACTIONS: ReadonlySet<RepositoryActionKey> = new Set([
  RepositoryActionKey.Open,
  RepositoryActionKey.NewFeature,
  RepositoryActionKey.Chat,
  RepositoryActionKey.Delete,
]);

/** Menu-row classes per action tone. */
const TONE_CLASS: Record<RepositoryActionTone, string> = {
  [RepositoryActionTone.Default]: '',
  [RepositoryActionTone.Positive]: 'text-emerald-600 dark:text-emerald-400',
  [RepositoryActionTone.Accent]: 'text-violet-600 dark:text-violet-400',
  [RepositoryActionTone.Destructive]: 'text-destructive focus:text-destructive',
};

export interface SessionTreeRepositoryActionsProps {
  repository: SessionTreeRepository;
  /** Called after a mutation so the tree can reload. */
  onChanged?: () => void;
}

export function SessionTreeRepositoryActions({
  repository,
  onChanged,
}: SessionTreeRepositoryActionsProps) {
  const { t } = useTranslation('web');
  const router = useRouter();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  const handleOpen = useCallback(() => {
    if (!repository.id) return;
    router.push(`/repository/${repository.id}` as Parameters<typeof router.push>[0]);
  }, [router, repository.id]);

  const handleRequestDelete = useCallback(() => {
    setDeleteError('');
    setConfirmOpen(true);
  }, []);

  const handleConfirmDelete = useCallback(
    async ({ deleteFromDisk }: { deleteFromDisk: boolean }) => {
      if (!repository.id) return;

      setDeleting(true);
      setDeleteError('');
      const result = await deleteRepository(repository.id, { deleteFromDisk });
      setDeleting(false);

      if (!result.success) {
        setDeleteError(result.error ?? t('repositoryNode.removeFailed'));
        return;
      }

      setConfirmOpen(false);
      onChanged?.();
      // The canvas behind the tree reads repositories from the server, so it
      // only loses the node once the route data is refetched.
      router.refresh();
    },
    [repository.id, onChanged, router, t]
  );

  // Without a path there is nothing to act on.
  if (!repository.path) return null;

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="hover:bg-muted rounded p-0.5"
            aria-label={t('sessionTree.repositoryActions')}
            data-testid={`session-tree-repository-actions-${repository.path}`}
            onClick={(e) => e.stopPropagation()}
          >
            <MoreHorizontal className="h-3 w-3" />
          </button>
        </DropdownMenuTrigger>

        <DropdownMenuContent align="end" className="w-56">
          {/* Radix unmounts this while closed, which is what keeps the action
              state lazy — the tree renders one menu per repository, and probing
              webhook + dev-server status for all of them on load would be a
              request storm for menus nobody opened. */}
          <RepositoryActionItems
            repository={repository}
            onOpen={handleOpen}
            onRequestDelete={handleRequestDelete}
          />
        </DropdownMenuContent>
      </DropdownMenu>

      <RepositoryDeleteDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        repositoryName={repository.name}
        onConfirm={(options) => void handleConfirmDelete(options)}
        error={deleteError}
        busy={deleting}
      />
    </>
  );
}

/**
 * The menu rows themselves. Separate component so the action state it binds is
 * created only while the menu is mounted.
 */
function RepositoryActionItems({
  repository,
  onOpen,
  onRequestDelete,
}: {
  repository: SessionTreeRepository;
  onOpen: () => void;
  onRequestDelete: () => void;
}) {
  // Identity-based actions need an id; a repository known only by path gets the
  // path-based subset rather than buttons that cannot work.
  const { actions } = useRepositoryCardActions({
    ...(repository.id !== undefined && {
      repositoryId: repository.id,
      onOpen,
      onDelete: onRequestDelete,
    }),
    repositoryName: repository.name,
    repositoryPath: repository.path,
  });

  return (
    <>
      {actions.map((action, index) => (
        <ActionItem
          key={action.key}
          action={action}
          separated={action.key === RepositoryActionKey.Delete && index > 0}
        />
      ))}
    </>
  );
}

/** One menu row. Destructive actions are set apart by a separator. */
function ActionItem({ action, separated }: { action: RepositoryAction; separated: boolean }) {
  const Icon = action.icon;

  return (
    <>
      {separated ? <DropdownMenuSeparator /> : null}
      <DropdownMenuItem
        className={cn('gap-2 text-xs', TONE_CLASS[action.tone])}
        disabled={action.disabled || action.loading}
        data-testid={`session-tree-repository-action-${action.key}`}
        onSelect={(e) => {
          if (!DISMISSING_ACTIONS.has(action.key)) e.preventDefault();
          action.run();
        }}
      >
        {action.loading ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Icon className="h-3.5 w-3.5" />
        )}
        {action.label}
      </DropdownMenuItem>
    </>
  );
}
