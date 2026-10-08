'use client';

/**
 * SupervisorGuardrailRules (spec 111)
 *
 * Editor for the deterministic guardrail rules a `SupervisorPolicy` carries.
 *
 * These bounds are evaluated in TypeScript *before* the supervisor's LLM
 * evaluator runs, which is the whole point of them: a rule that passes can
 * auto-approve a gate without spending a model call, and a rule that is
 * breached escalates to a human without the model being consulted at all.
 *
 * Two fields decide everything, so the editor keeps them adjacent and explicit:
 * which gate a rule governs, and whether it may auto-approve.
 */

import { useRef, useState, type ReactElement } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { GuardrailGateType } from '@shepai/core/domain/generated/output';
import type { GuardrailRule } from '@shepai/core/domain/generated/output';

const GATE_OPTIONS: { value: GuardrailGateType; label: string }[] = [
  { value: GuardrailGateType.prd, label: 'PRD gate' },
  { value: GuardrailGateType.plan, label: 'Plan gate' },
  { value: GuardrailGateType.merge, label: 'Merge gate' },
  { value: GuardrailGateType.all, label: 'Every gate' },
];

const VALID_GATES = new Set<string>(Object.values(GuardrailGateType));

export interface SupervisorGuardrailRulesProps {
  rules: GuardrailRule[];
  onChange: (rules: GuardrailRule[]) => void;
  disabled?: boolean;
  className?: string;
}

/**
 * Parses the policy's stored `guardrailRulesJson`.
 *
 * Unreadable input yields an empty list rather than throwing: this editor sits
 * in a settings form, and a hand-edited database should not take the form down.
 * The core evaluator is stricter — it treats unreadable rules as "cannot prove
 * compliance" and escalates — which is the right asymmetry, since only one of
 * the two is a safety decision.
 */
export function parseGuardrailRules(json?: string): GuardrailRule[] {
  if (!json) return [];
  try {
    const parsed: unknown = JSON.parse(json);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (entry): entry is GuardrailRule =>
        !!entry &&
        typeof entry === 'object' &&
        typeof (entry as GuardrailRule).id === 'string' &&
        typeof (entry as GuardrailRule).gate === 'string' &&
        VALID_GATES.has((entry as GuardrailRule).gate)
    );
  } catch {
    return [];
  }
}

/** Splits a comma-separated pattern list, dropping blanks. */
export function parsePatterns(value: string): string[] | undefined {
  const patterns = value
    .split(',')
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
  return patterns.length > 0 ? patterns : undefined;
}

function formatPatterns(patterns?: string[]): string {
  return patterns?.join(', ') ?? '';
}

/**
 * The blocked-paths field, which is the one input in this form that cannot be
 * bound to its own parsed value.
 *
 * `parsePatterns` trims and drops blanks, so a trailing `,` or space disappears
 * on the keystroke that types it and the input re-renders without it. Typing two
 * glob patterns separated by a comma, one character at a time, therefore
 * concatenates them into a single pattern that matches NEITHER path — so a rule
 * the user believes escalates auth changes would auto-approve them. Pasting
 * works, which is exactly why a `fireEvent.change` test cannot catch this.
 *
 * The fix is to own the raw text here and parse only on the way out, keeping the
 * rule as the source of truth for everything except the characters in flight.
 */
function BlockedPathsInput({
  id,
  testId,
  patterns,
  onPatternsChange,
  disabled,
}: {
  id: string;
  testId: string;
  patterns?: string[];
  onPatternsChange: (patterns: string[] | undefined) => void;
  disabled?: boolean;
}): ReactElement {
  const [text, setText] = useState(() => formatPatterns(patterns));

  // The rule set is the source of truth, but re-deriving the text on every
  // render is the bug. Track the value this field last emitted: while the
  // incoming rule still carries it, the change is this field's own echo and the
  // raw text stands. Anything else came from outside — a saved policy loading,
  // a form reset — and must be picked up.
  //
  // The re-sync runs during render rather than in an effect so the corrected
  // text is what this render paints, and it is guarded on a state change React
  // would actually make, which is what stops it looping.
  const lastEmitted = useRef<string[] | undefined>(patterns);
  const incoming = patterns ?? [];
  if (!samePatterns(incoming, lastEmitted.current)) {
    lastEmitted.current = patterns;
    setText(formatPatterns(patterns));
  }

  const handleChange = (value: string) => {
    setText(value);
    const parsed = parsePatterns(value);
    lastEmitted.current = parsed;
    onPatternsChange(parsed);
  };

  return (
    <Input
      id={id}
      data-testid={testId}
      placeholder="e.g. **/auth/**, **/migrations/**, package.json"
      value={text}
      disabled={disabled}
      onChange={(e) => handleChange(e.target.value)}
    />
  );
}

/** Are two pattern lists the same list? Order matters — it is what the user sees. */
function samePatterns(a: readonly string[] | undefined, b: readonly string[] | undefined): boolean {
  const left = a ?? [];
  const right = b ?? [];
  if (left.length !== right.length) return false;
  return left.every((pattern, i) => pattern === right[i]);
}

/** Empty or unparseable input clears the bound rather than pinning it to zero. */
function parseOptionalInt(value: string): number | undefined {
  const trimmed = value.trim();
  if (trimmed === '') return undefined;
  const parsed = Number(trimmed);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : undefined;
}

function nextRuleId(rules: GuardrailRule[]): string {
  const taken = new Set(rules.map((r) => r.id));
  let index = rules.length + 1;
  while (taken.has(`rule-${index}`)) index++;
  return `rule-${index}`;
}

function emptyRule(rules: GuardrailRule[]): GuardrailRule {
  return {
    id: nextRuleId(rules),
    gate: GuardrailGateType.merge,
    autoApprove: true,
  };
}

export function SupervisorGuardrailRules({
  rules,
  onChange,
  disabled = false,
  className,
}: SupervisorGuardrailRulesProps) {
  // Row identity has to survive edits to the rule's own `id` field. An index
  // key is what `react/no-array-index-key` warns about, and keying by `rule.id`
  // would remount the name input on every keystroke and drop focus. A parallel
  // key list — extended only when the row count grows, truncated when it
  // shrinks — is stable through both.
  const rowKeys = useRef<string[]>([]);
  if (rowKeys.current.length !== rules.length) {
    const next = rowKeys.current.slice(0, rules.length);
    while (next.length < rules.length) {
      next.push(`guardrail-row-${next.length}-${rules.length}`);
    }
    rowKeys.current = next;
  }

  const update = (index: number, patch: Partial<GuardrailRule>) => {
    onChange(rules.map((rule, i) => (i === index ? { ...rule, ...patch } : rule)));
  };

  return (
    <fieldset className={className} disabled={disabled} data-testid="guardrail-rules">
      <legend className="text-sm font-medium">Guardrail rules</legend>
      <p className="text-muted-foreground mt-1 mb-3 text-xs">
        Checked before the evaluator model is asked. When every rule that applies to a gate passes
        and allows it, the gate is approved without a model call. When one is breached, the gate
        stays open for you and the model is not consulted.
      </p>

      {rules.length === 0 ? (
        <p className="text-muted-foreground rounded border border-dashed px-3 py-4 text-center text-xs">
          No guardrail rules. Every gate goes to the evaluator model.
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          {rules.map((rule, index) => (
            <div
              key={rowKeys.current[index]}
              className="flex flex-col gap-3 rounded-lg border p-3"
              data-testid="guardrail-rule"
            >
              <div className="flex items-end gap-2">
                <div className="flex flex-1 flex-col gap-1">
                  <Label htmlFor={`guardrail-id-${index}`}>Rule name (required)</Label>
                  <Input
                    id={`guardrail-id-${index}`}
                    data-testid={`guardrail-id-${index}`}
                    value={rule.id}
                    placeholder="e.g. rule-low-risk-merge"
                    onChange={(e) => update(index, { id: e.target.value })}
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <Label htmlFor={`guardrail-gate-${index}`}>Applies to</Label>
                  <Select
                    value={rule.gate}
                    onValueChange={(v) => update(index, { gate: v as GuardrailGateType })}
                  >
                    <SelectTrigger
                      id={`guardrail-gate-${index}`}
                      className="w-40"
                      data-testid={`guardrail-gate-${index}`}
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {GATE_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  data-testid={`guardrail-remove-${index}`}
                  onClick={() => onChange(rules.filter((_, i) => i !== index))}
                >
                  Remove
                </Button>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="flex flex-col gap-1">
                  <Label htmlFor={`guardrail-diff-${index}`}>Max diff lines</Label>
                  <Input
                    id={`guardrail-diff-${index}`}
                    data-testid={`guardrail-diff-${index}`}
                    inputMode="numeric"
                    placeholder="unlimited"
                    value={rule.maxDiffLines ?? ''}
                    onChange={(e) =>
                      update(index, { maxDiffLines: parseOptionalInt(e.target.value) })
                    }
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <Label htmlFor={`guardrail-files-${index}`}>Max files changed</Label>
                  <Input
                    id={`guardrail-files-${index}`}
                    data-testid={`guardrail-files-${index}`}
                    inputMode="numeric"
                    placeholder="unlimited"
                    value={rule.maxFilesChanged ?? ''}
                    onChange={(e) =>
                      update(index, { maxFilesChanged: parseOptionalInt(e.target.value) })
                    }
                  />
                </div>
              </div>

              <div className="flex flex-col gap-1">
                <Label htmlFor={`guardrail-paths-${index}`}>Always escalate if these change</Label>
                <BlockedPathsInput
                  id={`guardrail-paths-${index}`}
                  testId={`guardrail-paths-${index}`}
                  patterns={rule.blockedPathPatterns}
                  disabled={disabled}
                  onPatternsChange={(patterns) => update(index, { blockedPathPatterns: patterns })}
                />
                <p className="text-muted-foreground text-xs">
                  Comma-separated glob patterns. A match forces human review, whatever the size
                  bounds say.
                </p>
              </div>

              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-6">
                <div className="flex items-center gap-2">
                  <Switch
                    id={`guardrail-ci-${index}`}
                    data-testid={`guardrail-ci-${index}`}
                    checked={rule.requireCiPass === true}
                    onCheckedChange={(checked) =>
                      update(index, { requireCiPass: checked ? true : undefined })
                    }
                  />
                  <Label htmlFor={`guardrail-ci-${index}`} className="text-xs font-normal">
                    Require CI green
                  </Label>
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    id={`guardrail-auto-${index}`}
                    data-testid={`guardrail-auto-${index}`}
                    checked={rule.autoApprove}
                    onCheckedChange={(checked) => update(index, { autoApprove: checked })}
                  />
                  <Label htmlFor={`guardrail-auto-${index}`} className="text-xs font-normal">
                    Approve automatically when every rule passes
                  </Label>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <Button
        type="button"
        variant="outline"
        size="sm"
        className="mt-3"
        data-testid="guardrail-add"
        onClick={() => onChange([...rules, emptyRule(rules)])}
      >
        Add rule
      </Button>
    </fieldset>
  );
}
