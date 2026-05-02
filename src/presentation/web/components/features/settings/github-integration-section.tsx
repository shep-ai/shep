'use client';

/**
 * GitHub Integration settings section.
 *
 * Stores a single Personal Access Token (encrypted at rest via LocalSecretBox).
 * When set, every new terminal session shep spawns gets GH_TOKEN /
 * GITHUB_TOKEN injected automatically — so `gh`, `git push`, etc. authenticate
 * without the user having to run `gh auth login` interactively.
 *
 * The token is only sent to the server once (on Connect). After that, the
 * client only ever knows whether one is stored, never its value.
 */

import { useEffect, useState, useTransition } from 'react';
import { Eye, EyeOff, CheckCircle2, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  connectGithubAction,
  disconnectGithubAction,
  getGithubStatusAction,
} from '@/app/actions/github-integration';
import type { GithubIntegrationStatus } from '@shepai/core/application/ports/output/repositories/github-integration.repository.interface';

const PAT_DOCS_URL = 'https://github.com/settings/tokens?type=beta';

export function GithubIntegrationSection() {
  const [status, setStatus] = useState<GithubIntegrationStatus | null>(null);
  const [token, setToken] = useState('');
  const [showToken, setShowToken] = useState(false);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    let cancelled = false;
    void getGithubStatusAction()
      .then((s) => {
        if (!cancelled) setStatus(s);
      })
      .catch(() => {
        if (!cancelled) setStatus({ connected: false, connectedAt: null, updatedAt: null });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  function handleConnect() {
    const trimmed = token.trim();
    if (!trimmed) {
      toast.error('Paste a GitHub Personal Access Token first');
      return;
    }
    startTransition(async () => {
      const result = await connectGithubAction(trimmed);
      if (result.success) {
        toast.success(`Connected to GitHub${result.login ? ` as @${result.login}` : ''}`);
        setToken('');
        setShowToken(false);
        const next = await getGithubStatusAction();
        setStatus(next);
      } else {
        toast.error(result.error ?? 'Failed to connect to GitHub');
      }
    });
  }

  function handleDisconnect() {
    startTransition(async () => {
      const result = await disconnectGithubAction();
      if (result.success) {
        toast.success('GitHub disconnected');
        const next = await getGithubStatusAction();
        setStatus(next);
      } else {
        toast.error(result.error ?? 'Failed to disconnect');
      }
    });
  }

  if (status === null) {
    return (
      <div className="text-muted-foreground py-4 text-xs" data-testid="github-integration-loading">
        Checking GitHub integration…
      </div>
    );
  }

  if (status.connected) {
    return (
      <div className="space-y-3 py-3" data-testid="github-integration-connected">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 text-emerald-500" />
          <span className="text-sm">Connected</span>
          {status.updatedAt ? (
            <span className="text-muted-foreground text-[11px]">
              · last updated {new Date(status.updatedAt).toLocaleDateString()}
            </span>
          ) : null}
        </div>
        <p className="text-muted-foreground text-[11px] leading-relaxed">
          Every terminal opened in shep now has <code>GH_TOKEN</code> and <code>GITHUB_TOKEN</code>{' '}
          set automatically. <code>gh</code>, <code>git push</code>, and other tools that read those
          env vars will authenticate as your GitHub user.
        </p>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleDisconnect}
            disabled={isPending}
            data-testid="github-disconnect-button"
          >
            {isPending ? 'Disconnecting…' : 'Disconnect'}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3 py-3" data-testid="github-integration-disconnected">
      <div className="space-y-1.5">
        <Label htmlFor="github-pat" className="text-xs">
          Personal Access Token
        </Label>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Input
              id="github-pat"
              data-testid="github-pat-input"
              type={showToken ? 'text' : 'password'}
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="github_pat_… or ghp_…"
              autoComplete="off"
              className="pr-9 font-mono text-xs"
              disabled={isPending}
            />
            <button
              type="button"
              onClick={() => setShowToken((v) => !v)}
              className="text-muted-foreground hover:text-foreground absolute top-1/2 right-2 -translate-y-1/2"
              aria-label={showToken ? 'Hide token' : 'Show token'}
              tabIndex={-1}
            >
              {showToken ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
            </button>
          </div>
          <Button
            size="sm"
            onClick={handleConnect}
            disabled={isPending || !token.trim()}
            data-testid="github-connect-button"
          >
            {isPending ? 'Connecting…' : 'Connect'}
          </Button>
        </div>
      </div>
      <p className="text-muted-foreground text-[11px] leading-relaxed">
        Create a fine-grained PAT with <code>contents: read/write</code> and{' '}
        <code>pull requests: read/write</code> on the repos you want shep to access. Token is
        encrypted at rest and never leaves this machine.
      </p>
      <a
        href={PAT_DOCS_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-[11px] transition-colors"
      >
        <ExternalLink className="h-3 w-3" />
        Generate a token on github.com
      </a>
    </div>
  );
}
