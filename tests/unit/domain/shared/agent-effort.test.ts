import { describe, it, expect } from 'vitest';
import { AGENT_EFFORT_LEVELS, parseAgentEffort } from '@/domain/shared/agent-effort.js';
import { AgentEffort } from '@/domain/generated/output.js';

describe('AGENT_EFFORT_LEVELS', () => {
  it('lists every level from least to most reasoning', () => {
    expect(AGENT_EFFORT_LEVELS).toEqual([
      AgentEffort.low,
      AgentEffort.medium,
      AgentEffort.high,
      AgentEffort.xhigh,
      AgentEffort.max,
    ]);
  });

  it('covers every AgentEffort member', () => {
    expect([...AGENT_EFFORT_LEVELS].sort()).toEqual(Object.values(AgentEffort).sort());
  });
});

describe('parseAgentEffort', () => {
  it.each(Object.values(AgentEffort))('accepts the canonical value %s', (value) => {
    expect(parseAgentEffort(value)).toBe(value);
  });

  it('is case and whitespace insensitive', () => {
    expect(parseAgentEffort('  HIGH ')).toBe(AgentEffort.high);
    expect(parseAgentEffort('XHigh')).toBe(AgentEffort.xhigh);
  });

  it('returns undefined for missing, empty or unknown values', () => {
    expect(parseAgentEffort(undefined)).toBeUndefined();
    expect(parseAgentEffort(null)).toBeUndefined();
    expect(parseAgentEffort('')).toBeUndefined();
    expect(parseAgentEffort('ultra')).toBeUndefined();
    expect(parseAgentEffort('--effort')).toBeUndefined();
  });
});
