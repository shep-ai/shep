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

  // Re-sync defaults whenever the modal is reopened with new context.
  useEffect(() => {
    if (open) {
      setOwnerLogin(initialOwner);
      setRepoName(defaultRepoName);
      setIsPublic(false);
      setError(null);
      setSubmitting(false);
    }
  }, [open, initialOwner, defaultRepoName]);

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
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to publish');
    } finally {
      setSubmitting(false);
    }
  }

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

        <div className="grid gap-4 py-2">
          {/* Owner picker */}
          <label className="grid gap-1.5">
            <span className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
              Owner
            </span>
            <Select value={ownerLogin} onValueChange={setOwnerLogin} disabled={submitting}>
              <SelectTrigger>
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
            <span className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
              Repository name
            </span>
            <Input
              value={repoName}
              onChange={(e) => setRepoName(e.target.value)}
              placeholder="my-cool-app"
              disabled={submitting}
              autoComplete="off"
              spellCheck={false}
            />
            {!nameValid && repoName.length > 0 ? (
              <span className="text-destructive flex items-center gap-1 text-xs">
                <AlertTriangle className="size-3" />
                Use letters, numbers, dots, dashes, or underscores.
              </span>
            ) : null}
          </label>

          {/* Visibility toggle */}
          <div className="bg-muted/40 flex items-center justify-between rounded-md border px-3 py-2">
            <div className="flex items-center gap-2">
              {isPublic ? (
                <Unlock className="size-4 text-emerald-500" />
              ) : (
                <Lock className="text-muted-foreground size-4" />
              )}
              <div>
                <div className="text-sm font-medium">{isPublic ? 'Public' : 'Private'}</div>
                <div className="text-muted-foreground text-xs">
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
            <div className="text-muted-foreground inline-flex items-center gap-1 text-xs">
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

        <DialogFooter>
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
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
      </DialogContent>
    </Dialog>
  );
}
