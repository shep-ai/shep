/**
 * Tests that the project-memory ("Shep Brain") section is injected into EVERY
 * agent prompt across the SDLC when memory is present, and omitted entirely when
 * absent — so every running agent shares the same durable context, while fresh
 * repositories see no behavioural change.
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
import { buildRequirementsPrompt } from '@/infrastructure/services/agents/feature-agent/nodes/prompts/requirements.prompt.js';
import { buildResearchPrompt } from '@/infrastructure/services/agents/feature-agent/nodes/prompts/research.prompt.js';
import { buildPlanPrompt } from '@/infrastructure/services/agents/feature-agent/nodes/prompts/plan.prompt.js';
import { buildFastImplementPrompt } from '@/infrastructure/services/agents/feature-agent/nodes/prompts/fast-implement.prompt.js';
import { buildCommitPushPrPrompt } from '@/infrastructure/services/agents/feature-agent/nodes/prompts/merge-prompts.js';
import { buildCiWatchFixPrompt } from '@/infrastructure/services/agents/feature-agent/nodes/prompts/merge-prompts.js';
import {
  buildProjectMemorySection,
  renderProjectMemoryBlock,
} from '@/infrastructure/services/agents/feature-agent/nodes/prompts/project-memory-section.js';
import { FeatureContextBuilder } from '@/infrastructure/services/interactive/feature-context.builder.js';
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
const HEADER = 'Project Memory (read-only reference)';

describe('renderProjectMemoryBlock / buildProjectMemorySection', () => {
  it('returns an empty string when no memory is present', () => {
    expect(renderProjectMemoryBlock(undefined)).toBe('');
    expect(renderProjectMemoryBlock('   ')).toBe('');
    expect(buildProjectMemorySection(createState({ projectMemory: undefined }))).toBe('');
  });

  it('renders a read-only memory block when memory is present', () => {
    const section = buildProjectMemorySection(createState({ projectMemory: MEMORY }));
    expect(section).toContain(HEADER);
    expect(section).toContain('Use use-cases as the only entry point.');
    // Defensive framing: must tell the agent not to execute the block.
    expect(section.toLowerCase()).toContain('do not execute');
  });
});

// Every state-bearing producer prompt injects the section.
describe.each([
  { name: 'analyze', build: buildAnalyzePrompt },
  { name: 'requirements', build: buildRequirementsPrompt },
  { name: 'research', build: buildResearchPrompt },
  { name: 'plan', build: buildPlanPrompt },
  { name: 'fast-implement', build: buildFastImplementPrompt },
])('$name prompt — project memory injection', ({ build }) => {
  it('includes the memory section when state.projectMemory is set', () => {
    const prompt = build(createState({ projectMemory: MEMORY }));
    expect(prompt).toContain(HEADER);
    expect(prompt).toContain('Use use-cases as the only entry point.');
  });

  it('omits the memory section when state.projectMemory is absent', () => {
    const prompt = build(createState({ projectMemory: undefined }));
    expect(prompt).not.toContain(HEADER);
  });
});

describe('merge commit-push-pr prompt — project memory injection', () => {
  it('includes the memory section when present', () => {
    const prompt = buildCommitPushPrPrompt(
      createState({ projectMemory: MEMORY }),
      'feat/x',
      'main'
    );
    expect(prompt).toContain(HEADER);
  });

  it('omits it when absent', () => {
    const prompt = buildCommitPushPrPrompt(createState(), 'feat/x', 'main');
    expect(prompt).not.toContain(HEADER);
  });
});

describe('CI-fix prompt — project memory injection', () => {
  it('includes the memory section when a blob is passed', () => {
    const prompt = buildCiWatchFixPrompt('logs', 1, 3, 'feat/x', MEMORY);
    expect(prompt).toContain(HEADER);
    expect(prompt).toContain('Use use-cases as the only entry point.');
  });

  it('omits it when no blob is passed', () => {
    const prompt = buildCiWatchFixPrompt('logs', 1, 3, 'feat/x');
    expect(prompt).not.toContain(HEADER);
  });
});

describe('interactive agent context — project memory injection', () => {
  const feature = { id: 'feat-1', name: 'Test', repositoryPath: '/tmp/repo' } as never;

  it('includes the memory section when a blob is passed', () => {
    const context = new FeatureContextBuilder().buildContext(feature, '/tmp/repo', [], MEMORY);
    expect(context).toContain(HEADER);
    expect(context).toContain('Use use-cases as the only entry point.');
  });

  it('omits it when no blob is passed', () => {
    const context = new FeatureContextBuilder().buildContext(feature, '/tmp/repo', []);
    expect(context).not.toContain(HEADER);
  });
});
