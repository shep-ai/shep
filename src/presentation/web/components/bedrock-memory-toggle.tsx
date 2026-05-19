'use client';

import { useState, useTransition } from 'react';
import { toast } from 'sonner';

import {
  enableBedrock as defaultEnableBedrock,
  type EnableBedrockResult,
} from '@/app/actions/enable-bedrock.action';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';

export interface BedrockMemoryToggleProps {
  applicationId: string;
  initialEnabled: boolean;
  /**
   * Stories and tests inject a stand-in for the server action so the three
   * Storybook states (Default / Loading / Error) render without a real DI
   * container. Production callers leave this undefined to use the real action.
   */
  enableActionOverride?: (applicationId: string) => Promise<EnableBedrockResult>;
}

interface FailureState {
  code: string;
  remediation: string;
}

export function BedrockMemoryToggle({
  applicationId,
  initialEnabled,
  enableActionOverride,
}: BedrockMemoryToggleProps) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [failure, setFailure] = useState<FailureState | null>(null);
  const [isPending, startTransition] = useTransition();

  const action = enableActionOverride ?? defaultEnableBedrock;

  function handleToggle(next: boolean) {
    // The M ships enable-only — disabling is not yet exposed because the
    // underlying use case does not implement teardown. Ignore off-clicks
    // so the switch acts as a one-way commit.
    if (!next) return;
    if (enabled) return;

    setEnabled(true);
    setFailure(null);

    startTransition(async () => {
      const result = await action(applicationId);
      if (!result.ok) {
        setEnabled(false);
        setFailure({ code: result.code, remediation: result.remediation });
        toast.error(result.remediation);
        return;
      }
      setEnabled(result.bedrockEnabled);
    });
  }

  return (
    <div
      className="flex flex-col gap-1"
      data-testid="bedrock-memory-toggle-container"
      data-pending={isPending ? 'true' : 'false'}
    >
      <div className="flex items-center justify-between">
        <div className="flex flex-col">
          <Label htmlFor="bedrock-memory-toggle">Bedrock memory</Label>
          <span className="text-muted-foreground text-xs">
            Persist markdown project memory for AI coding agents.
          </span>
        </div>
        <Switch
          id="bedrock-memory-toggle"
          data-testid="bedrock-memory-toggle"
          checked={enabled}
          disabled={isPending || initialEnabled}
          onCheckedChange={handleToggle}
        />
      </div>
      {failure ? (
        <p
          className="text-destructive text-xs"
          data-testid="bedrock-toggle-remediation"
          role="alert"
        >
          {failure.remediation}
        </p>
      ) : null}
    </div>
  );
}
