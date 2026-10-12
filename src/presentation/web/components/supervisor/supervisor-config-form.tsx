'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { SupervisorAutonomy } from '@shepai/core/domain/generated/output';
import type { GuardrailRule, SupervisorPolicy } from '@shepai/core/domain/generated/output';
import { configureSupervisor } from '@/app/actions/configure-supervisor';
import { SupervisorGuardrailRules, parseGuardrailRules } from './supervisor-guardrail-rules';

const AUTONOMY_OPTIONS: { value: SupervisorAutonomy; label: string; description: string }[] = [
  {
    value: SupervisorAutonomy.advisory,
    label: 'Advisory',
    description: 'Supervisor recommends, user always decides. Safest default.',
  },
  {
    value: SupervisorAutonomy.cosign,
    label: 'Co-sign',
    description: 'Both supervisor and user must approve before a gate can pass.',
  },
  {
    value: SupervisorAutonomy.autonomous,
    label: 'Autonomous',
    description: 'Supervisor acts on the user’s behalf within configured policy.',
  },
];

const GATE_KEYS = ['prd', 'plan', 'merge'] as const;
type GateKey = (typeof GATE_KEYS)[number];

export interface SupervisorConfigFormProps {
  scopeType: string;
  scopeId?: string;
  featureId?: string;
  /** When `null`, the form starts blank (no policy configured yet). */
  initialPolicy: SupervisorPolicy | null;
  /** Optional override for the submit handler — used by tests/Storybook. */
  onSubmitOverride?: (input: SubmitInput) => Promise<SubmitResult>;
  /** Override loading state (Storybook). */
  forceState?: 'default' | 'loading' | 'error';
}

interface SubmitInput {
  scopeType: string;
  scopeId?: string;
  featureId?: string;
  autonomyLevel: SupervisorAutonomy;
  modelId?: string;
  promptVersion?: string;
  gateAuthority?: Partial<Record<GateKey, SupervisorAutonomy>>;
  guardrailRules?: GuardrailRule[];
}

interface SubmitResult {
  ok: boolean;
  error?: string;
}

function parseGateAuthority(json?: string): Partial<Record<GateKey, SupervisorAutonomy>> {
  if (!json) return {};
  try {
    const parsed = JSON.parse(json);
    if (!parsed || typeof parsed !== 'object') return {};
    return parsed as Partial<Record<GateKey, SupervisorAutonomy>>;
  } catch {
    return {};
  }
}

export function SupervisorConfigForm({
  scopeType,
  scopeId,
  featureId,
  initialPolicy,
  onSubmitOverride,
  forceState = 'default',
}: SupervisorConfigFormProps) {
  const initialAutonomy = initialPolicy?.autonomyLevel ?? SupervisorAutonomy.advisory;
  const initialGate = parseGateAuthority(initialPolicy?.gateAuthorityJson);
  const initialGuardrails = parseGuardrailRules(initialPolicy?.guardrailRulesJson);

  const [autonomyLevel, setAutonomyLevel] = useState<SupervisorAutonomy>(initialAutonomy);
  const [modelId, setModelId] = useState<string>(initialPolicy?.modelId ?? '');
  const [promptVersion, setPromptVersion] = useState<string>(initialPolicy?.promptVersion ?? '');
  const [gateAuthority, setGateAuthority] =
    useState<Partial<Record<GateKey, SupervisorAutonomy>>>(initialGate);
  const [guardrailRules, setGuardrailRules] = useState<GuardrailRule[]>(initialGuardrails);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(
    forceState === 'error' ? 'Failed to save supervisor policy' : null
  );
  const [savedAt, setSavedAt] = useState<Date | null>(null);

  const loading = forceState === 'loading' || isSubmitting;

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);

    const input: SubmitInput = {
      scopeType,
      scopeId,
      featureId,
      autonomyLevel,
      modelId: modelId.trim() || undefined,
      promptVersion: promptVersion.trim() || undefined,
      gateAuthority: Object.keys(gateAuthority).length > 0 ? gateAuthority : undefined,
      guardrailRules: guardrailRules.length > 0 ? guardrailRules : undefined,
    };

    try {
      const result = onSubmitOverride
        ? await onSubmitOverride(input)
        : await configureSupervisor(input);

      if (!result.ok) {
        setError(result.error ?? 'Failed to save supervisor policy');
      } else {
        setSavedAt(new Date());
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save supervisor policy');
    } finally {
      setIsSubmitting(false);
    }
  };

  const setGate = (gate: GateKey, value: SupervisorAutonomy | 'inherit') => {
    setGateAuthority((prev) => {
      const next = { ...prev };
      if (value === 'inherit') {
        delete next[gate];
      } else {
        next[gate] = value;
      }
      return next;
    });
  };

  return (
    <form
      onSubmit={handleSubmit}
      data-testid="supervisor-config-form"
      className="flex flex-col gap-6 rounded-lg border p-6"
      aria-busy={loading}
    >
      <header className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold">Supervisor agent</h2>
        <p className="text-muted-foreground text-sm">
          {featureId
            ? 'Per-feature override. Falls back to the scope-level policy when unset.'
            : `${scopeType.charAt(0).toUpperCase() + scopeType.slice(1)}-level policy. Applies to every feature unless overridden.`}
        </p>
      </header>

      <div className="flex flex-col gap-2">
        <Label htmlFor="autonomyLevel">Autonomy level</Label>
        <Select
          value={autonomyLevel}
          onValueChange={(v) => setAutonomyLevel(v as SupervisorAutonomy)}
          disabled={loading}
        >
          <SelectTrigger id="autonomyLevel" data-testid="autonomy-trigger">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {AUTONOMY_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-muted-foreground text-xs">
          {AUTONOMY_OPTIONS.find((o) => o.value === autonomyLevel)?.description}
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="modelId">Evaluator model</Label>
        <Input
          id="modelId"
          data-testid="model-id-input"
          placeholder="e.g. claude-sonnet-4"
          value={modelId}
          onChange={(e) => setModelId(e.target.value)}
          disabled={loading}
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="promptVersion">Prompt version</Label>
        <Input
          id="promptVersion"
          data-testid="prompt-version-input"
          placeholder="e.g. v1"
          value={promptVersion}
          onChange={(e) => setPromptVersion(e.target.value)}
          disabled={loading}
        />
      </div>

      <fieldset className="flex flex-col gap-3" disabled={loading}>
        <legend className="text-sm font-medium">Per-gate authority</legend>
        {GATE_KEYS.map((gate) => {
          const current = gateAuthority[gate] ?? 'inherit';
          const checkboxId = `gate-${gate}`;
          return (
            <div
              key={gate}
              className="flex items-center justify-between gap-3"
              data-testid={`gate-row-${gate}`}
            >
              <Label htmlFor={checkboxId} className="capitalize">
                {gate}
              </Label>
              <Select
                value={current}
                onValueChange={(v) => setGate(gate, v as SupervisorAutonomy | 'inherit')}
              >
                <SelectTrigger
                  id={checkboxId}
                  className="w-44"
                  data-testid={`gate-trigger-${gate}`}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="inherit">Inherit</SelectItem>
                  {AUTONOMY_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          );
        })}
      </fieldset>

      <SupervisorGuardrailRules
        rules={guardrailRules}
        onChange={setGuardrailRules}
        disabled={loading}
      />

      {initialPolicy ? (
        <div className="flex items-center justify-between rounded border px-3 py-2">
          <div className="flex flex-col">
            <span className="text-sm font-medium">
              Currently {initialPolicy.enabled ? 'enabled' : 'disabled'}
            </span>
            <span className="text-muted-foreground text-xs">
              Toggle without changing other settings
            </span>
          </div>
          <Switch
            checked={initialPolicy.enabled}
            disabled
            data-testid="enabled-readonly"
            aria-label="Supervisor enabled (read-only — toggle via the Enable/Disable buttons)"
          />
        </div>
      ) : null}

      {error ? (
        <Alert variant="destructive" data-testid="form-error">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      {savedAt ? (
        <Alert data-testid="form-saved">
          <AlertDescription>Saved at {savedAt.toLocaleTimeString()}</AlertDescription>
        </Alert>
      ) : null}

      <div className="flex justify-end">
        <Button type="submit" disabled={loading} data-testid="submit">
          {loading ? 'Saving…' : initialPolicy ? 'Update supervisor' : 'Save supervisor'}
        </Button>
      </div>
    </form>
  );
}
