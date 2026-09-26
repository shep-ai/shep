import 'reflect-metadata';
import { describe, it, expect } from 'vitest';
import {
  resolveEffortChange,
  createEffortCommand,
} from '@/presentation/cli/commands/settings/effort.command.js';
import { AgentEffort } from '@/domain/generated/output.js';

describe('resolveEffortChange', () => {
  it('prompts interactively when neither a level nor --clear is given', () => {
    expect(resolveEffortChange(undefined, {})).toEqual({ kind: 'prompt' });
  });

  it('sets a valid level, ignoring case and whitespace', () => {
    expect(resolveEffortChange(' XHigh ', {})).toEqual({ kind: 'set', effort: AgentEffort.xhigh });
  });

  it('--clear resets to the agent default', () => {
    expect(resolveEffortChange(undefined, { clear: true })).toEqual({ kind: 'clear' });
  });

  it('rejects a level combined with --clear rather than picking one', () => {
    expect(() => resolveEffortChange('high', { clear: true })).toThrow(/cannot be combined/);
  });

  it('rejects an unknown level and lists the valid ones', () => {
    expect(() => resolveEffortChange('ultra', {})).toThrow(/low, medium, high, xhigh, max/);
  });
});

describe('createEffortCommand', () => {
  it('registers as "effort" with an optional level argument and --clear', () => {
    const command = createEffortCommand();
    expect(command.name()).toBe('effort');
    expect(command.registeredArguments[0]?.required).toBe(false);
    expect(command.options.map((o) => o.long)).toContain('--clear');
  });
});
