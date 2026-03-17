'use client';

import { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Loader2 } from 'lucide-react';
import { initRemoteRepository } from '@/app/actions/init-remote-repository';

const SUCCESS_DISPLAY_MS = 5000;
const ERROR_CLEAR_MS = 5000;

export interface InitRemoteSectionProps {
  /** Repository UUID — maps to RepositoryNodeData.id */
  repositoryId: string;
  /** Absolute path to the repository — used to derive default repo name */
  repositoryPath: string;
  /** Test-only: pre-seeds the error state for Storybook stories */
  _initialErrorMessage?: string;
  /** Test-only: pre-seeds the success state for Storybook stories */
  _initialSuccessUrl?: string;
}

function deriveRepoName(repositoryPath: string): string {
  // Normalize Windows backslashes, then take the last non-empty segment
  const normalized = repositoryPath.replace(/\\/g, '/');
  return normalized.split('/').filter(Boolean).at(-1) ?? normalized;
}

export function InitRemoteSection({
  repositoryId,
  repositoryPath,
  _initialErrorMessage,
  _initialSuccessUrl,
}: InitRemoteSectionProps) {
  const [name, setName] = useState(() => deriveRepoName(repositoryPath));
  const [isPrivate, setIsPrivate] = useState(true);
  const [org, setOrg] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(_initialErrorMessage ?? null);
  const [successUrl, setSuccessUrl] = useState<string | null>(_initialSuccessUrl ?? null);

  const successTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const errorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (successTimerRef.current) clearTimeout(successTimerRef.current);
      if (errorTimerRef.current) clearTimeout(errorTimerRef.current);
    };
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;

    if (successTimerRef.current) clearTimeout(successTimerRef.current);
    if (errorTimerRef.current) clearTimeout(errorTimerRef.current);
    setErrorMessage(null);
    setLoading(true);

    try {
      const result = await initRemoteRepository({
        repositoryId,
        name: name.trim(),
        isPrivate,
        org: org.trim() || undefined,
      });

      if ('error' in result) {
        setErrorMessage(result.error);
        errorTimerRef.current = setTimeout(() => setErrorMessage(null), ERROR_CLEAR_MS);
      } else {
        setSuccessUrl(result.repoUrl.replace('https://', ''));
        successTimerRef.current = setTimeout(() => setSuccessUrl(null), SUCCESS_DISPLAY_MS);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'An unexpected error occurred';
      setErrorMessage(msg);
      errorTimerRef.current = setTimeout(() => setErrorMessage(null), ERROR_CLEAR_MS);
    } finally {
      setLoading(false);
    }
  }

  if (successUrl) {
    return (
      <div className="mt-4 border-t pt-4">
        <p className="text-muted-foreground mb-2 text-sm font-medium tracking-wide uppercase">
          Set Up GitHub Remote
        </p>
        <p className="text-sm text-green-600 dark:text-green-400">
          Remote configured: {successUrl}
        </p>
      </div>
    );
  }

  return (
    <div className="mt-4 border-t pt-4">
      <p className="text-muted-foreground mb-3 text-sm font-medium tracking-wide uppercase">
        Set Up GitHub Remote
      </p>
      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="space-y-1">
          <Label htmlFor="repo-name" className="text-xs">
            Repo name
          </Label>
          <Input
            id="repo-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={loading}
            required
            className="h-7 text-xs"
          />
        </div>

        <div className="space-y-1">
          <Label className="text-xs">Visibility</Label>
          <RadioGroup
            value={isPrivate ? 'private' : 'public'}
            onValueChange={(v) => setIsPrivate(v === 'private')}
            disabled={loading}
            className="flex gap-4"
          >
            <div className="flex items-center gap-1.5">
              <RadioGroupItem value="private" id="vis-private" />
              <Label htmlFor="vis-private" className="cursor-pointer text-xs font-normal">
                Private
              </Label>
            </div>
            <div className="flex items-center gap-1.5">
              <RadioGroupItem value="public" id="vis-public" />
              <Label htmlFor="vis-public" className="cursor-pointer text-xs font-normal">
                Public
              </Label>
            </div>
          </RadioGroup>
        </div>

        <div className="space-y-1">
          <Label htmlFor="repo-org" className="text-xs">
            Org <span className="text-muted-foreground">(optional)</span>
          </Label>
          <Input
            id="repo-org"
            value={org}
            onChange={(e) => setOrg(e.target.value)}
            disabled={loading}
            placeholder="GitHub org (optional)"
            className="h-7 text-xs"
          />
        </div>

        {errorMessage ? <p className="text-destructive text-xs">{errorMessage}</p> : null}

        <Button type="submit" size="sm" disabled={loading} className="w-full">
          {loading ? (
            <>
              <Loader2 className="mr-1 size-3 animate-spin" />
              Initialising…
            </>
          ) : (
            'Init Remote'
          )}
        </Button>
      </form>
    </div>
  );
}
