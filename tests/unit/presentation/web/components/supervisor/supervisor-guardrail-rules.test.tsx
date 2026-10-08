/**
 * SupervisorGuardrailRules — unit tests (spec 111).
 *
 * The editor is the only way to author the bounds the gate evaluator enforces
 * before it asks a model, so the contract that matters is that every field
 * round-trips into the rule set the policy stores, and that clearing a bound
 * removes it rather than pinning it to zero.
 */

import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import {
  SupervisorGuardrailRules,
  parseGuardrailRules,
  parsePatterns,
} from '@/components/supervisor/supervisor-guardrail-rules';
import { GuardrailGateType } from '@shepai/core/domain/generated/output';
import type { GuardrailRule } from '@shepai/core/domain/generated/output';

/** Most cases only read; only the interaction cases supply a handler. */
const noop = (): void => undefined;

const RULE: GuardrailRule = {
  id: 'rule-low-risk-merge',
  gate: GuardrailGateType.merge,
  maxDiffLines: 250,
  maxFilesChanged: 5,
  blockedPathPatterns: ['**/auth/**'],
  requireCiPass: true,
  autoApprove: true,
};

describe('SupervisorGuardrailRules', () => {
  it('states the default behaviour when no rules are configured', () => {
    render(<SupervisorGuardrailRules rules={[]} onChange={noop} />);

    expect(screen.getByTestId('guardrail-rules')).toHaveTextContent(
      /Every gate goes to the evaluator model/
    );
    expect(screen.queryAllByTestId('guardrail-rule')).toHaveLength(0);
  });

  it('renders every field of an existing rule', () => {
    render(<SupervisorGuardrailRules rules={[RULE]} onChange={noop} />);

    expect(screen.getByTestId('guardrail-id-0')).toHaveValue('rule-low-risk-merge');
    expect(screen.getByTestId('guardrail-diff-0')).toHaveValue('250');
    expect(screen.getByTestId('guardrail-files-0')).toHaveValue('5');
    expect(screen.getByTestId('guardrail-paths-0')).toHaveValue('**/auth/**');
    expect(screen.getByTestId('guardrail-ci-0')).toBeChecked();
    expect(screen.getByTestId('guardrail-auto-0')).toBeChecked();
  });

  it('adds a rule with a fresh id and a merge-gate default', () => {
    const onChange = vi.fn();
    render(<SupervisorGuardrailRules rules={[]} onChange={onChange} />);

    fireEvent.click(screen.getByTestId('guardrail-add'));

    expect(onChange).toHaveBeenCalledWith([
      { id: 'rule-1', gate: GuardrailGateType.merge, autoApprove: true },
    ]);
  });

  it('avoids colliding with an existing rule id when adding', () => {
    const onChange = vi.fn();
    render(<SupervisorGuardrailRules rules={[RULE]} onChange={onChange} />);

    fireEvent.click(screen.getByTestId('guardrail-add'));

    expect(onChange).toHaveBeenCalledWith([RULE, expect.objectContaining({ id: 'rule-2' })]);
  });

  it('removes the rule at its own index and leaves the others alone', () => {
    const onChange = vi.fn();
    const second: GuardrailRule = {
      id: 'rule-2',
      gate: GuardrailGateType.plan,
      autoApprove: false,
    };
    render(<SupervisorGuardrailRules rules={[RULE, second]} onChange={onChange} />);

    fireEvent.click(screen.getByTestId('guardrail-remove-0'));

    expect(onChange).toHaveBeenCalledWith([second]);
  });

  it('clears a numeric bound when the field is emptied', () => {
    const onChange = vi.fn();
    render(<SupervisorGuardrailRules rules={[RULE]} onChange={onChange} />);

    fireEvent.change(screen.getByTestId('guardrail-diff-0'), { target: { value: '' } });

    expect(onChange).toHaveBeenCalledWith([{ ...RULE, maxDiffLines: undefined }]);
  });

  it('ignores a non-numeric bound rather than writing NaN into the policy', () => {
    const onChange = vi.fn();
    render(<SupervisorGuardrailRules rules={[RULE]} onChange={onChange} />);

    fireEvent.change(screen.getByTestId('guardrail-files-0'), { target: { value: 'abc' } });

    expect(onChange).toHaveBeenCalledWith([{ ...RULE, maxFilesChanged: undefined }]);
  });

  it('parses blocked paths from a comma-separated list and drops blanks', () => {
    const onChange = vi.fn();
    render(<SupervisorGuardrailRules rules={[RULE]} onChange={onChange} />);

    fireEvent.change(screen.getByTestId('guardrail-paths-0'), {
      target: { value: '**/billing/**, , package.json ,' },
    });

    expect(onChange).toHaveBeenCalledWith([
      { ...RULE, blockedPathPatterns: ['**/billing/**', 'package.json'] },
    ]);
  });

  it('clears blocked paths entirely when the list is emptied', () => {
    const onChange = vi.fn();
    render(<SupervisorGuardrailRules rules={[RULE]} onChange={onChange} />);

    fireEvent.change(screen.getByTestId('guardrail-paths-0'), { target: { value: '   ' } });

    expect(onChange).toHaveBeenCalledWith([{ ...RULE, blockedPathPatterns: undefined }]);
  });

  /**
   * Typing is how users fill this field, and it is the one case the parsed-value
   * binding cannot survive: a trailing separator is dropped by `parsePatterns`
   * on the keystroke that types it, so the input re-renders without it and the
   * next pattern is appended to the previous one.
   *
   * The result is not cosmetic. The merged pattern matches neither `auth/` nor
   * `billing/`, so a rule the user believes escalates auth changes would
   * AUTO-APPROVE them — the opposite of the field's purpose. `fireEvent` sets
   * the whole value at once and therefore cannot see this.
   */
  it('keeps typed separators, so a character-by-character entry does not merge patterns', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    function Controlled() {
      const [rules, setRules] = React.useState<GuardrailRule[]>([RULE]);
      return (
        <SupervisorGuardrailRules
          rules={rules}
          onChange={(next) => {
            setRules(next);
            onChange(next);
          }}
        />
      );
    }

    render(<Controlled />);

    const input = screen.getByTestId('guardrail-paths-0');
    await user.clear(input);
    await user.type(input, '**/auth/**, **/billing/**');

    expect(input).toHaveValue('**/auth/**, **/billing/**');
    expect(onChange).toHaveBeenLastCalledWith([
      { ...RULE, blockedPathPatterns: ['**/auth/**', '**/billing/**'] },
    ]);
  });

  it('does not re-format the text the user is still typing', async () => {
    // `parsePatterns` trims, so re-rendering from the parsed value would also
    // swallow a trailing space mid-entry.
    const user = userEvent.setup();

    function Controlled() {
      const [rules, setRules] = React.useState<GuardrailRule[]>([RULE]);
      return <SupervisorGuardrailRules rules={rules} onChange={setRules} />;
    }

    render(<Controlled />);

    const input = screen.getByTestId('guardrail-paths-0');
    await user.clear(input);
    await user.type(input, '**/a/**, ');

    expect(input).toHaveValue('**/a/**, ');
  });

  it('picks up a rule set changed from outside the field', () => {
    // The local text must still follow a value that arrives from the parent
    // (loading a saved policy, resetting the form) — otherwise the field would
    // show stale text after the rule underneath it changed.
    const { rerender } = render(<SupervisorGuardrailRules rules={[RULE]} onChange={noop} />);

    const reloaded: GuardrailRule = {
      ...RULE,
      blockedPathPatterns: ['**/infra/**', '**/db/**'],
    };
    rerender(<SupervisorGuardrailRules rules={[reloaded]} onChange={noop} />);

    expect(screen.getByTestId('guardrail-paths-0')).toHaveValue('**/infra/**, **/db/**');
  });

  it('turns the CI requirement off without touching other fields', () => {
    const onChange = vi.fn();
    render(<SupervisorGuardrailRules rules={[RULE]} onChange={onChange} />);

    fireEvent.click(screen.getByTestId('guardrail-ci-0'));

    expect(onChange).toHaveBeenCalledWith([{ ...RULE, requireCiPass: undefined }]);
  });

  it('can turn auto-approval off, which keeps a human in the loop', () => {
    const onChange = vi.fn();
    render(<SupervisorGuardrailRules rules={[RULE]} onChange={onChange} />);

    fireEvent.click(screen.getByTestId('guardrail-auto-0'));

    expect(onChange).toHaveBeenCalledWith([{ ...RULE, autoApprove: false }]);
  });

  it('disables every control while the form is saving', () => {
    render(<SupervisorGuardrailRules rules={[RULE]} onChange={noop} disabled />);

    expect(screen.getByTestId('guardrail-rules')).toBeDisabled();
  });
});

describe('parseGuardrailRules', () => {
  it('returns an empty list for absent or unreadable input', () => {
    expect(parseGuardrailRules(undefined)).toEqual([]);
    expect(parseGuardrailRules('')).toEqual([]);
    expect(parseGuardrailRules('{not json')).toEqual([]);
    expect(parseGuardrailRules(JSON.stringify({ id: 'x' }))).toEqual([]);
  });

  it('round-trips a well-formed rule set', () => {
    expect(parseGuardrailRules(JSON.stringify([RULE]))).toEqual([RULE]);
  });

  it('drops entries that are not rules, so a hand-edited row cannot break the form', () => {
    const stored = JSON.stringify([RULE, { id: 'bad', gate: 'nope' }, null, 'string']);
    expect(parseGuardrailRules(stored)).toEqual([RULE]);
  });
});

describe('parsePatterns', () => {
  it('returns undefined rather than an empty array when nothing is left', () => {
    expect(parsePatterns('')).toBeUndefined();
    expect(parsePatterns(' , , ')).toBeUndefined();
  });

  it('trims each pattern', () => {
    expect(parsePatterns(' a ,b ')).toEqual(['a', 'b']);
  });
});
