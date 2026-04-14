'use client';

/**
 * PublishToGitHubModal — owner picker + repo name + visibility for one-click
 * GitHub publishing. Designed for non-technical users:
 *   • Title is "Publish to GitHub" (not "create remote").
 *   • Owner dropdown lists the authenticated user's personal account first
 *     and every org they belong to. The default selection is the personal
 *     account so the happy path is "click Publish".
 *   • Repo name is pre-filled with a sensible default (the application slug)
 *     and is freely editable.
 *   • Visibility toggle defaults to Public.
 *
 * The modal is purely presentational — it doesn't talk to the API directly.
 * The parent button hands it the owner list and a submit callback.
 */

import { useEffect, useMemo, useState } from 'react';
import { ExternalLink, Loader2, Lock, Unlock, AlertTriangle } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import { GitHubIcon } from './cloud-provider-icons';

export interface PublishOwner {
  login: string;
  kind: 'user' | 'org';
  description: string;
}

export interface PublishToGitHubModalProps {
  open: boolean;
  onOpenChange(open: boolean): void;
  /** Owners returned from /api/cloud-providers/github/orgs. The first entry
   *  is the authenticated user's personal account. */
  owners: PublishOwner[];
  /** Default repository name — typically the application slug. */
  defaultRepoName: string;
  /** Optional initial owner login (e.g. last-used preference). Falls back to
   *  the first entry in `owners`. */
  initialOwnerLogin?: string;
  /** Called when the user clicks Publish. Throws to surface an error to
   *  the user without closing the modal. */
  onSubmit(input: {
    ownerLogin: string;
    repoName: string;
    visibility: 'public' | 'private';
  }): Promise<void>;
}

const REPO_NAME_PATTERN = /^[A-Za-z0-9._-]+$/;

export function PublishToGitHubModal({
  open,
  onOpenChange,
  owners,
  defaultRepoName,
  initialOwnerLogin,
  onSubmit,
}: PublishToGitHubModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <GitHubIcon className="size-5" />
            Publish to GitHub
          </DialogTitle>
          <DialogDescription>
            Pick where this app should live on GitHub and what to call it. We&apos;ll create the
            repository and push the code in one go.
          </DialogDescription>
        </DialogHeader>

        <PublishToGitHubForm
          owners={owners}
          defaultRepoName={defaultRepoName}
          initialOwnerLogin={initialOwnerLogin}
          onSubmit={onSubmit}
          onCancel={() => onOpenChange(false)}
          variant="dialog"
        />
      </DialogContent>
    </Dialog>
  );
}

/**
 * PublishToGitHubForm — shell-less body of the publish flow. Rendered
 * either inside the modal above or inline as a subpanel of DeployPanel.
 * All the form state + validation + submit handling lives here so the
 * two surfaces stay pixel-identical without duplicating logic.
 */
export interface PublishToGitHubFormProps {
  owners: PublishOwner[];
  defaultRepoName: string;
  initialOwnerLogin?: string;
  onSubmit(input: {
    ownerLogin: string;
    repoName: string;
    visibility: 'public' | 'private';
  }): Promise<void>;
  onCancel(): void;
  /**
   * Controls chrome (padding, button layout). `dialog` matches the
   * legacy Dialog footer with ghost+primary side by side; `subpanel`
   * is denser for the popover so the whole form fits without scroll.
   */
  variant?: 'dialog' | 'subpanel';
}

export function PublishToGitHubForm({
  owners,
  defaultRepoName,
  initialOwnerLogin,
  onSubmit,
  onCancel,
  variant = 'dialog',
}: PublishToGitHubFormProps) {
  const initialOwner = useMemo(() => {
    if (initialOwnerLogin) {
      const match = owners.find((o) => o.login === initialOwnerLogin);
      if (match) return match.login;
    }
    return owners[0]?.login ?? '';
  }, [owners, initialOwnerLogin]);

  const [ownerLogin, setOwnerLogin] = useState<string>(initialOwner);
  const [repoName, setRepoName] = useState<string>(defaultRepoName);
  // Private by default — protect the user's code unless they
  // explicitly choose to make it public. Earlier versions defaulted
  // to public which leaked an unknown amount of user code to the
  // open internet on the very first publish click.
  const [isPublic, setIsPublic] = useState<boolean>(false);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Re-sync defaults whenever the owner list or default name changes
  // from the parent (e.g. new app context, first load of /orgs). For
  // the dialog variant this mirrors the old open-state reset.
  useEffect(() => {
    setOwnerLogin(initialOwner);
    setRepoName(defaultRepoName);
    setError(null);
    setSubmitting(false);
  }, [initialOwner, defaultRepoName]);

  const trimmedName = repoName.trim();
  const nameValid = trimmedName.length > 0 && REPO_NAME_PATTERN.test(trimmedName);
  const ownerValid = ownerLogin.trim().length > 0;
  const canSubmit = nameValid && ownerValid && !submitting;
  const previewUrl = ownerValid && nameValid ? `github.com/${ownerLogin}/${trimmedName}` : null;

  async function handleSubmit() {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      await onSubmit({
        ownerLogin,
        repoName: trimmedName,
        visibility: isPublic ? 'public' : 'private',
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to publish';
      // GitHubRepoNameTakenError message: 'Repository "name" already exists on owner.'
      // Detect it and offer a clear rename suggestion so the user
      // doesn't need to guess what went wrong.
      if (/already exists/i.test(msg)) {
        // Suggest a numbered variant of whatever they typed.
        const suggestion = /\d+$/.test(trimmedName)
          ? trimmedName.replace(/\d+$/, (n) => String(Number(n) + 1))
          : `${trimmedName}-2`;
        setError(
          `"${trimmedName}" is already taken on GitHub — try "${suggestion}" or any other unique name.`
        );
      } else {
        setError(msg);
      }
    } finally {
      setSubmitting(false);
    }
  }

  const isSubpanel = variant === 'subpanel';

  return (
    <div className={cn('flex flex-col', isSubpanel ? 'gap-3 px-4 py-3' : 'gap-0')}>
      <div className={cn('grid', isSubpanel ? 'gap-3' : 'gap-4 py-2')}>
        {/* Owner picker */}
        <label className="grid gap-1.5">
          <span className="text-muted-foreground text-[10px] font-medium tracking-wide uppercase">
            Owner
          </span>
          <Select value={ownerLogin} onValueChange={setOwnerLogin} disabled={submitting}>
            <SelectTrigger className={isSubpanel ? 'h-8 text-xs' : undefined}>
              <SelectValue placeholder="Choose an owner…" />
            </SelectTrigger>
            <SelectContent>
              {owners.map((owner) => (
                <SelectItem key={owner.login} value={owner.login}>
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{owner.login}</span>
                    <span className="text-muted-foreground text-xs">
                      {owner.kind === 'user' ? 'personal' : 'organization'}
                    </span>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>

        {/* Repo name input */}
        <label className="grid gap-1.5">
          <span className="text-muted-foreground text-[10px] font-medium tracking-wide uppercase">
            Repository name
          </span>
          <Input
            value={repoName}
            onChange={(e) => setRepoName(e.target.value)}
            placeholder="my-cool-app"
            disabled={submitting}
            autoComplete="off"
            spellCheck={false}
            className={isSubpanel ? 'h-8 text-xs' : undefined}
          />
          {!nameValid && repoName.length > 0 ? (
            <span className="text-destructive flex items-center gap-1 text-xs">
              <AlertTriangle className="size-3" />
              Use letters, numbers, dots, dashes, or underscores.
            </span>
          ) : null}
        </label>

        {/* Visibility toggle */}
        <div
          className={cn(
            'bg-muted/40 flex items-center justify-between rounded-md border',
            isSubpanel ? 'px-2.5 py-1.5' : 'px-3 py-2'
          )}
        >
          <div className="flex items-center gap-2">
            {isPublic ? (
              <Unlock className="size-4 text-emerald-500" />
            ) : (
              <Lock className="text-muted-foreground size-4" />
            )}
            <div>
              <div className={cn('font-medium', isSubpanel ? 'text-xs' : 'text-sm')}>
                {isPublic ? 'Public' : 'Private'}
              </div>
              <div className={cn('text-muted-foreground', isSubpanel ? 'text-[10px]' : 'text-xs')}>
                {isPublic
                  ? 'Anyone can see this repository on GitHub.'
                  : 'Only you and people you invite can see it.'}
              </div>
            </div>
          </div>
          <Switch
            checked={isPublic}
            onCheckedChange={setIsPublic}
            disabled={submitting}
            aria-label="Toggle public visibility"
          />
        </div>

        {/* Live preview */}
        {previewUrl ? (
          <div
            className={cn(
              'text-muted-foreground inline-flex items-center gap-1',
              isSubpanel ? 'text-[10px]' : 'text-xs'
            )}
          >
            <ExternalLink className="size-3" />
            <span className="truncate">{previewUrl}</span>
          </div>
        ) : null}

        {error ? (
          <p className="text-destructive flex items-start gap-1 text-xs">
            <AlertTriangle className="mt-px size-3 shrink-0" />
            <span>{error}</span>
          </p>
        ) : null}
      </div>

      {isSubpanel ? (
        <div className="flex items-center justify-end gap-2 pt-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={onCancel}
            disabled={submitting}
            className="h-7 cursor-pointer text-[11px]"
          >
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="h-7 cursor-pointer text-[11px]"
          >
            {submitting ? (
              <>
                <Loader2 className="size-3 animate-spin" />
                Publishing…
              </>
            ) : (
              'Publish'
            )}
          </Button>
        </div>
      ) : (
        <DialogFooter>
          <Button
            variant="ghost"
            onClick={onCancel}
            disabled={submitting}
            className="cursor-pointer"
          >
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={!canSubmit} className="cursor-pointer">
            {submitting ? (
              <>
                <Loader2 className="size-3 animate-spin" />
                Publishing…
              </>
            ) : (
              'Publish'
            )}
          </Button>
        </DialogFooter>
      )}
    </div>
  );
}
