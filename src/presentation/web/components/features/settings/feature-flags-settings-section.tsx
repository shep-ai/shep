'use client';

import { useState, useTransition, useRef, useEffect } from 'react';
import { Flag, Check } from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { updateSettingsAction } from '@/app/actions/update-settings';
import type { FeatureFlags } from '@shepai/core/domain/generated/output';

const FLAG_DESCRIPTIONS: Record<keyof FeatureFlags, string> = {
  skills: 'Enable Skills navigation and functionality in the web UI',
  envDeploy: 'Enable environment deployment features in the web UI',
  debug: 'Enable debug UI elements and verbose client-side logging',
  githubImport: 'Enable GitHub repository import in the web UI',
  adoptBranch: 'Enable the ability to adopt existing branches as tracked features',
  gitRebaseSync: 'Enable git rebase-on-main and sync-main operations in the web UI',
  reactFileManager:
    'Use the built-in React file manager instead of the native OS folder picker. Also serves as automatic fallback when the native picker is unavailable.',
  coastsDevServer:
    'Enable Coasts containerized runtime isolation for the dev server, providing per-worktree isolation via Docker containers',
};

const FLAG_LABELS: Record<keyof FeatureFlags, string> = {
  skills: 'Skills',
  envDeploy: 'Deployments',
  debug: 'Debug',
  githubImport: 'GitHub Import',
  adoptBranch: 'Adopt Branch',
  gitRebaseSync: 'Git Rebase & Sync',
  reactFileManager: 'React File Manager',
  coastsDevServer: 'Coasts Dev Server',
};

const FLAG_KEYS: (keyof FeatureFlags)[] = [
  'skills',
  'envDeploy',
  'debug',
  'githubImport',
  'adoptBranch',
  'gitRebaseSync',
  'reactFileManager',
  'coastsDevServer',
];

export interface FeatureFlagsSettingsSectionProps {
  featureFlags: FeatureFlags;
}

export function FeatureFlagsSettingsSection({ featureFlags }: FeatureFlagsSettingsSectionProps) {
  const [flags, setFlags] = useState<FeatureFlags>({ ...featureFlags });
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

  function handleFlagChange(key: keyof FeatureFlags, value: boolean) {
    const newFlags = { ...flags, [key]: value };
    setFlags(newFlags);
    startTransition(async () => {
      const result = await updateSettingsAction({ featureFlags: newFlags });
      if (!result.success) {
        toast.error(result.error ?? 'Failed to save feature flags');
      }
    });
  }

  return (
    <Card id="feature-flags" className="scroll-mt-6" data-testid="feature-flags-settings-section">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Flag className="text-muted-foreground h-4 w-4" />
            <CardTitle>Feature Flags</CardTitle>
          </div>
          {isPending ? <span className="text-muted-foreground text-xs">Saving...</span> : null}
          {showSaved && !isPending ? (
            <span className="flex items-center gap-1 text-xs text-green-600">
              <Check className="h-3 w-3" />
              Saved
            </span>
          ) : null}
        </div>
        <CardDescription>
          Toggle experimental and optional features. Changes take effect after page navigation.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {FLAG_KEYS.map((key) => (
          <div key={key} className="flex items-center justify-between gap-4">
            <div className="space-y-0.5">
              <Label htmlFor={`flag-${key}`}>{FLAG_LABELS[key]}</Label>
              <p className="text-muted-foreground text-xs">{FLAG_DESCRIPTIONS[key]}</p>
            </div>
            <Switch
              id={`flag-${key}`}
              data-testid={`switch-flag-${key}`}
              checked={flags[key]}
              onCheckedChange={(v) => handleFlagChange(key, v)}
            />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
