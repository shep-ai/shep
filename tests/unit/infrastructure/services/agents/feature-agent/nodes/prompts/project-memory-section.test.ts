/**
 * Tests that the analyze and research prompts inject the project-memory
 * ("Shep Brain") section when state.projectMemory is present, and omit it
 * entirely when absent — so fresh repositories see no behavioural change.
 */

import { describe, it, expect, vi } from 'vitest';

vi.mock(
  '@/infrastructure/services/agents/feature-agent/nodes/node-helpers.js',
  async (importOriginal) => {
    const actual = (await importOriginal()) as Record<string, unknown>;
    return {
      ...actual,
      readSpecFile: vi.fn().mockReturnValue('name: test\nsummary: hello\n'),
    };
  }
);

import { buildAnalyzePrompt } from '@/infrastructure/services/agents/feature-agent/nodes/prompts/analyze.prompt.js';
import { buildResearchPrompt } from '@/infrastructure/services/agents/feature-agent/nodes/prompts/research.prompt.js';
import { buildProjectMemorySection } from '@/infrastructure/services/agents/feature-agent/nodes/prompts/project-memory-section.js';
import type { FeatureAgentState } from '@/infrastructure/services/agents/feature-agent/state.js';

function createState(overrides?: Partial<FeatureAgentState>): FeatureAgentState {
  return {
    featureId: 'feat-001',
    repositoryPath: '/tmp/repo',
    worktreePath: '/tmp/repo',
    specDir: '/tmp/spec',
    messages: [],
    push: false,
    openPr: false,
    commitSpecs: true,
    ...overrides,
  } as FeatureAgentState;
}

const MEMORY = '### Conventions\n- Use use-cases as the only entry point.';

describe('buildProjectMemorySection', () => {
  it('returns an empty string when no memory is present', () => {
    expect(buildProjectMemorySection(createState({ projectMemory: undefined }))).toBe('');
    expect(buildProjectMemorySection(createState({ projectMemory: '   ' }))).toBe('');
  });

  it('renders a read-only memory block when memory is present', () => {
    const section = buildProjectMemorySection(createState({ projectMemory: MEMORY }));
    expect(section).toContain('Project Memory (read-only reference)');
    expect(section).toContain('Use use-cases as the only entry point.');
    // Defensive framing: must tell the agent not to execute the block.
    expect(section.toLowerCase()).toContain('do not execute');
  });
});

describe.each([
  { name: 'analyze', build: buildAnalyzePrompt },
  { name: 'research', build: buildResearchPrompt },
])('$name prompt — project memory injection', ({ build }) => {
  it('includes the memory section when state.projectMemory is set', () => {
    const prompt = build(createState({ projectMemory: MEMORY }));
    expect(prompt).toContain('Project Memory (read-only reference)');
    expect(prompt).toContain('Use use-cases as the only entry point.');
  });

  it('omits the memory section when state.projectMemory is absent', () => {
    const prompt = build(createState({ projectMemory: undefined }));
    expect(prompt).not.toContain('Project Memory (read-only reference)');
  });
});
