'use client';

/**
 * ScannerProfileSection (Phase 11, task-82).
 *
 * Lets the user toggle each scan stage, set path excludes, and view per-app
 * last-scan summary. Designed to be mounted inside the per-application
 * settings view (gated on featureFlags.aspm). The component itself is
 * presentation-only — it accepts a save callback so the caller wires in
 * the appropriate server action (`saveScannerProfile`) and feature-flag
 * gating.
 */

import { useState } from 'react';
import { Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ScanStageName, type ScannerProfile } from '@shepai/core/domain/generated/output';

export interface ScannerProfileSectionProps {
  /** Initial profile to render. When undefined, the section shows defaults (everything enabled). */
  initialProfile?: ScannerProfile;
  /** Last scan summary line ("Last scanned 12 min ago — 7 findings") — caller-formatted. */
  lastScanSummary?: string;
  /** Save callback. Receives the edited profile; should persist via server action. */
  onSave?: (profile: ScannerProfile) => Promise<{ ok: boolean; error?: string }>;
}

const STAGES: { id: ScanStageName; label: string }[] = [
  { id: ScanStageName.Sbom, label: 'SBOM build' },
  { id: ScanStageName.Sca, label: 'SCA (OSV.dev)' },
  { id: ScanStageName.Secrets, label: 'Secrets' },
  { id: ScanStageName.Sast, label: 'SAST (agent)' },
  { id: ScanStageName.Container, label: 'Container hardening (agent)' },
  { id: ScanStageName.Iac, label: 'IaC misconfiguration (agent)' },
];

function defaultProfile(): ScannerProfile {
  return {
    enabledStages: STAGES.map((s) => s.id),
    pathExcludes: [],
    autoRescan: true,
  };
}

export function ScannerProfileSection({
  initialProfile,
  lastScanSummary,
  onSave,
}: ScannerProfileSectionProps) {
  const [profile, setProfile] = useState<ScannerProfile>(initialProfile ?? defaultProfile());
  const [savingState, setSavingState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);

  const toggleStage = (id: ScanStageName) => {
    setProfile((prev) => {
      const enabled = new Set<ScanStageName>(prev.enabledStages);
      if (enabled.has(id)) enabled.delete(id);
      else enabled.add(id);
      return { ...prev, enabledStages: [...enabled] };
    });
  };

  const setExcludes = (raw: string) => {
    const lines = raw
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 0);
    setProfile((prev) => ({ ...prev, pathExcludes: lines }));
  };

  const toggleAutoRescan = (next: boolean) => {
    setProfile((prev) => ({ ...prev, autoRescan: next }));
  };

  const handleSave = async () => {
    if (!onSave) return;
    setSavingState('saving');
    setError(null);
    const result = await onSave(profile);
    if (result.ok) {
      setSavingState('saved');
      return;
    }
    setSavingState('error');
    setError(result.error ?? 'Save failed');
  };

  return (
    <section
      className="border-border/60 bg-card space-y-4 rounded border p-4"
      data-testid="scanner-profile-section"
    >
      <header>
        <h3 className="text-base font-semibold">Scanner profile</h3>
        <p className="text-muted-foreground text-sm">
          Toggle each stage and exclude paths. Re-running on an unchanged tree is a no-op.
        </p>
        {lastScanSummary ? (
          <p className="text-muted-foreground mt-1 text-xs" data-testid="scanner-profile-last">
            {lastScanSummary}
          </p>
        ) : null}
      </header>

      <fieldset className="space-y-2" data-testid="scanner-profile-stages">
        <legend className="text-sm font-medium">Stages</legend>
        {STAGES.map((s) => {
          const enabled = profile.enabledStages.includes(s.id);
          return (
            <label key={s.id} className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={enabled}
                onCheckedChange={() => toggleStage(s.id)}
                aria-label={`Toggle ${s.label}`}
                data-testid={`scanner-profile-stage-${s.id}`}
              />
              <span>{s.label}</span>
            </label>
          );
        })}
      </fieldset>

      <div className="space-y-1">
        <Label htmlFor="scanner-profile-excludes">Path excludes (one glob per line)</Label>
        <Textarea
          id="scanner-profile-excludes"
          placeholder="**/fixtures/**&#10;**/__snapshots__/**"
          value={profile.pathExcludes.join('\n')}
          onChange={(e) => setExcludes(e.target.value)}
          className="font-mono text-xs"
          rows={4}
        />
      </div>

      <label className="flex items-center gap-2 text-sm">
        <Checkbox
          checked={profile.autoRescan}
          onCheckedChange={(v) => toggleAutoRescan(v === true)}
          aria-label="Toggle nightly auto-rescan"
          data-testid="scanner-profile-auto-rescan"
        />
        <span>Run nightly auto-rescan</span>
      </label>

      <div className="flex items-center justify-between">
        <div className="text-xs" aria-live="polite">
          {savingState === 'saved' ? (
            <span className="text-emerald-600">Saved.</span>
          ) : savingState === 'error' ? (
            <span className="text-destructive">{error}</span>
          ) : null}
        </div>
        <Button
          type="button"
          onClick={handleSave}
          disabled={!onSave || savingState === 'saving'}
          data-testid="scanner-profile-save"
        >
          <Save className="mr-2 h-4 w-4" />
          {savingState === 'saving' ? 'Saving…' : 'Save profile'}
        </Button>
      </div>
    </section>
  );
}
