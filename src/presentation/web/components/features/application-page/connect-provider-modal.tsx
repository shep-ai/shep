'use client';

/**
 * ConnectProviderModal — token paste dialog for cloud deploy providers.
 *
 * Opens when the user selects an enabled-but-not-connected provider from
 * the Deploy dropdown. Shows the provider icon, a "Get a token" external
 * link, a textarea for the token, and a Connect button that submits to
 * POST /api/cloud-providers/:provider/connect via the useCloudDeployAction
 * hook.
 */

import { useState } from 'react';
import { ExternalLink } from 'lucide-react';
import { CloudDeploymentProvider } from '@shepai/core/domain/generated/output';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { CLOUD_PROVIDER_ICONS } from './cloud-provider-icons';

const PROVIDER_TOKEN_PAGES: Record<CloudDeploymentProvider, string> = {
  [CloudDeploymentProvider.CloudflarePages]: 'https://dash.cloudflare.com/profile/api-tokens',
  [CloudDeploymentProvider.Vercel]: 'https://vercel.com/account/tokens',
  [CloudDeploymentProvider.Netlify]:
    'https://app.netlify.com/user/applications#personal-access-tokens',
  [CloudDeploymentProvider.AwsAmplify]:
    'https://us-east-1.console.aws.amazon.com/iam/home#/security_credentials',
  [CloudDeploymentProvider.GcpCloudRun]: 'https://console.cloud.google.com/apis/credentials',
};

const PROVIDER_DISPLAY_NAMES: Record<CloudDeploymentProvider, string> = {
  [CloudDeploymentProvider.CloudflarePages]: 'Cloudflare Pages',
  [CloudDeploymentProvider.Vercel]: 'Vercel',
  [CloudDeploymentProvider.Netlify]: 'Netlify',
  [CloudDeploymentProvider.AwsAmplify]: 'AWS Amplify',
  [CloudDeploymentProvider.GcpCloudRun]: 'Google Cloud Run',
};

export type ConnectProviderModalMode = 'connect' | 'update';

export interface ConnectProviderModalProps {
  provider: CloudDeploymentProvider | null;
  mode?: ConnectProviderModalMode;
  onClose(): void;
  onSubmit(provider: CloudDeploymentProvider, token: string): Promise<void>;
}

export function ConnectProviderModal({
  provider,
  mode = 'connect',
  onClose,
  onSubmit,
}: ConnectProviderModalProps) {
  const [token, setToken] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const Icon = provider ? CLOUD_PROVIDER_ICONS[provider] : null;
  const tokenUrl = provider ? PROVIDER_TOKEN_PAGES[provider] : '';
  const displayName = provider ? PROVIDER_DISPLAY_NAMES[provider] : '';

  async function handleSubmit() {
    if (!provider || token.trim().length === 0) return;
    setSubmitting(true);
    setError(null);
    try {
      await onSubmit(provider, token.trim());
      setToken('');
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to connect');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog
      open={provider !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {Icon ? <Icon className="size-5" /> : null}
            {mode === 'update' ? `Update ${displayName} token` : `Connect to ${displayName}`}
          </DialogTitle>
          <DialogDescription>
            {mode === 'update'
              ? `Paste a new ${displayName} API token to replace the one stored on this machine. The previous token will be overwritten.`
              : `Paste your ${displayName} API token below. It is stored encrypted on this machine and never sent anywhere else.`}
          </DialogDescription>
        </DialogHeader>

        <a
          href={tokenUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary inline-flex cursor-pointer items-center gap-1 text-xs hover:underline"
        >
          Get a token <ExternalLink className="size-3" />
        </a>

        <Textarea
          value={token}
          onChange={(e) => setToken(e.target.value)}
          placeholder="Paste your API token here…"
          className="mt-2 min-h-[80px] font-mono text-xs"
        />

        {error ? <p className="text-destructive text-xs">{error}</p> : null}

        <DialogFooter>
          <Button
            variant="ghost"
            onClick={onClose}
            disabled={submitting}
            className="cursor-pointer"
          >
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={submitting || token.trim().length === 0}
            className="cursor-pointer"
          >
            {submitting
              ? mode === 'update'
                ? 'Updating…'
                : 'Connecting…'
              : mode === 'update'
                ? 'Update token'
                : 'Connect'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
