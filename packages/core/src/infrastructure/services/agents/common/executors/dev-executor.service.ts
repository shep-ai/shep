/** Dev Agent Executor — local development mock for the full SDLC flow.
 * Activated when settings.agent.type = "dev". Phase detection via regex on
 * prompt text; no interface changes. Delay: DEV_EXECUTOR_DELAY_MS (default 2000ms). */
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { AgentType, AgentFeature } from '../../../../../domain/generated/output.js';
import type {
  IAgentExecutor,
  AgentExecutionOptions,
  AgentExecutionResult,
  AgentExecutionStreamEvent,
} from '../../../../../application/ports/output/agents/agent-executor.interface.js';
import { SPEC_ANALYZE_FIXTURE } from './fixtures/spec-analyze.fixture.js';
import { SPEC_REQUIREMENTS_FIXTURE } from './fixtures/spec-requirements.fixture.js';
import { RESEARCH_FIXTURE } from './fixtures/research.fixture.js';
import { PLAN_FIXTURE } from './fixtures/plan.fixture.js';
import { TASKS_FIXTURE } from './fixtures/tasks.fixture.js';
import { devStructuredAnswer } from './dev-structured-answers.js';

const DEFAULT_DELAY_MS = 2000;

const ADJECTIVES = [
  'quantum',
  'blazing',
  'cosmic',
  'fuzzy',
  'turbo',
  'hyperbolic',
  'spectral',
  'chromatic',
  'orbital',
  'fractal',
  'velvet',
  'neon',
  'arctic',
  'molten',
  'prismatic',
  'phantom',
  'galactic',
  'atomic',
  'sonic',
  'ethereal',
];
const NOUNS = [
  'widget',
  'pipeline',
  'dashboard',
  'renderer',
  'compiler',
  'beacon',
  'transformer',
  'navigator',
  'interceptor',
  'gateway',
  'synthesizer',
  'orchestrator',
  'resolver',
  'dispatcher',
  'emitter',
  'detector',
  'aggregator',
  'scheduler',
  'validator',
  'serializer',
];
const VERBS = [
  'add',
  'implement',
  'integrate',
  'build',
  'create',
  'wire up',
  'introduce',
  'scaffold',
  'bootstrap',
  'enable',
];

function randomMetadata(): string {
  const adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
  const noun = NOUNS[Math.floor(Math.random() * NOUNS.length)];
  const verb = VERBS[Math.floor(Math.random() * VERBS.length)];
  const slug = `${adj}-${noun}`;
  const name = `${adj.charAt(0).toUpperCase() + adj.slice(1)} ${noun.charAt(0).toUpperCase() + noun.slice(1)}`;
  return JSON.stringify({
    slug,
    name,
    description: `${verb.charAt(0).toUpperCase() + verb.slice(1)} a ${adj} ${noun} to the application`,
  });
}

function randomPrNumber(): number {
  return Math.floor(Math.random() * 900) + 100;
}

function randomCommitHash(): string {
  return Math.random().toString(16).slice(2, 10);
}

function mergeCommitResult(): string {
  const pr = randomPrNumber();
  const hash = randomCommitHash();
  return (
    `[feat/dev-branch ${hash}] feat: dev implementation\n` +
    `https://github.com/shep-ai/shep/pull/${pr}\nPull request #${pr} created successfully.`
  );
}

function mergeSquashResult(): string {
  const pr = randomPrNumber();
  return `Merged PR #${pr} with squash merge. Branch feat/dev-branch deleted.`;
}

const IMPLEMENT_RESULT = 'Implementation complete. All tests pass.\npnpm test: 47 passed, 0 failed';

const CI_FIX_RESULT = 'Fixed CI failure: corrected import path. All checks now passing.';

/**
 * Extract specDir from a YAML-producing prompt.
 * Refs: analyze.prompt.ts:39, requirements.prompt.ts:92, research.prompt.ts:45,
 * plan.prompt.ts:199.
 */
function extractSpecDir(prompt: string): string | null {
  // Match both Unix absolute paths (/...) and Windows absolute paths (C:\...)
  const ABS_PATH = String.raw`(?:\/|[A-Za-z]:[/\\])[^\s\n]+`;

  // Analyze ("Write your analysis to:"), requirements ("Update the file at:"),
  // research ("Write your research to:")
  const fileMatch = prompt.match(
    new RegExp(`(?:Write your \\w+ to|Update the file at):\\s+(${ABS_PATH})`)
  );
  if (fileMatch) return path.dirname(fileMatch[1]);

  // Plan: "Write to BOTH /path/plan.yaml AND /path/tasks.yaml"
  const planMatch = prompt.match(new RegExp(`Write to BOTH\\s+(${ABS_PATH})[/\\\\]plan\\.yaml`));
  if (planMatch) return planMatch[1];

  return null;
}

/** Validate extracted specDir: must be absolute, no ".." traversal. */
function validateSpecDir(specDir: string): void {
  if (!path.isAbsolute(specDir))
    throw new Error(`DevAgentExecutorService: invalid specDir (not absolute): ${specDir}`);
  if (specDir.includes('..'))
    throw new Error(`DevAgentExecutorService: invalid specDir (contains ".."): ${specDir}`);
}

export class DevAgentExecutorService implements IAgentExecutor {
  readonly agentType: AgentType = 'dev' as AgentType;
  private readonly delayMs: number;

  constructor() {
    this.delayMs = parseInt(process.env.DEV_EXECUTOR_DELAY_MS ?? String(DEFAULT_DELAY_MS), 10);
  }

  async execute(prompt: string, _options?: AgentExecutionOptions): Promise<AgentExecutionResult> {
    if (this.delayMs > 0) {
      await new Promise<void>((resolve) => setTimeout(resolve, this.delayMs));
    }
    const result = this.dispatch(prompt);
    // Simulate realistic Claude Code token counts: prompts are large due to
    // system prompt + codebase context; output varies by phase.
    const baseInputTokens = Math.floor(prompt.length * 0.25); // ~4 chars/token
    const contextTokens = 25000 + Math.floor(Math.random() * 15000); // cached context
    const cacheReadTokens = Math.floor(contextTokens * 0.7);
    const cacheCreationTokens = contextTokens - cacheReadTokens;
    const inputTokens = baseInputTokens + contextTokens;
    const outputTokens = Math.floor(result.length * 0.25) + 500;
    const numTurns = Math.floor(Math.random() * 8) + 1;

    // Pricing: ~$3/M input, ~$15/M output, cache read ~$0.30/M, cache write ~$3.75/M
    const costUsd =
      baseInputTokens * 0.000003 +
      cacheCreationTokens * 0.00000375 +
      cacheReadTokens * 0.0000003 +
      outputTokens * 0.000015;

    // API time correlates with output tokens and turns
    const durationApiMs = Math.floor(outputTokens * 0.08 * numTurns + Math.random() * 2000);

    return {
      result,
      usage: {
        inputTokens,
        outputTokens,
        cacheCreationInputTokens: cacheCreationTokens,
        cacheReadInputTokens: cacheReadTokens,
        costUsd: Math.round(costUsd * 10000) / 10000, // 4 decimal places
        numTurns,
        durationApiMs,
      },
    };
  }

  async *executeStream(
    prompt: string,
    options?: AgentExecutionOptions
  ): AsyncIterable<AgentExecutionStreamEvent> {
    const result = await this.execute(prompt, options);
    yield { type: 'result', content: result.result, timestamp: new Date() };
  }

  supportsFeature(_feature: AgentFeature): boolean {
    return false;
  }

  private dispatch(prompt: string): string {
    // Metadata: mock-executor.service.ts extractUserInput pattern
    if (prompt.includes('User request:\n"')) return randomMetadata();

    // Analyze: analyze.prompt.ts:39
    if (prompt.includes('Write your analysis to:')) {
      const specDir = extractSpecDir(prompt);
      if (specDir) {
        validateSpecDir(specDir);
        fs.mkdirSync(specDir, { recursive: true });
        fs.writeFileSync(path.join(specDir, 'spec.yaml'), SPEC_ANALYZE_FIXTURE, 'utf8');
      }
      return 'Analysis complete. spec.yaml written.';
    }

    // Requirements: requirements.prompt.ts:92
    if (prompt.includes('Update the file at:')) {
      const specDir = extractSpecDir(prompt);
      if (specDir) {
        validateSpecDir(specDir);
        fs.mkdirSync(specDir, { recursive: true });
        fs.writeFileSync(path.join(specDir, 'spec.yaml'), SPEC_REQUIREMENTS_FIXTURE, 'utf8');
      }
      return 'Requirements complete. spec.yaml updated.';
    }

    // Research: research.prompt.ts:45
    if (prompt.includes('Write your research to:')) {
      const specDir = extractSpecDir(prompt);
      if (specDir) {
        validateSpecDir(specDir);
        fs.mkdirSync(specDir, { recursive: true });
        fs.writeFileSync(path.join(specDir, 'research.yaml'), RESEARCH_FIXTURE, 'utf8');
      }
      return 'Research complete. research.yaml written.';
    }

    // Plan: plan.prompt.ts:199
    if (prompt.includes('Write to BOTH')) {
      const specDir = extractSpecDir(prompt);
      if (specDir) {
        validateSpecDir(specDir);
        fs.mkdirSync(specDir, { recursive: true });
        fs.writeFileSync(path.join(specDir, 'plan.yaml'), PLAN_FIXTURE, 'utf8');
        fs.writeFileSync(path.join(specDir, 'tasks.yaml'), TASKS_FIXTURE, 'utf8');
      }
      return 'Planning complete. plan.yaml and tasks.yaml written.';
    }

    // Implement: implement.prompt.ts:91
    if (prompt.includes('performing autonomous implementation')) return IMPLEMENT_RESULT;

    // Merge commit/push/PR: merge-prompts.ts:88
    if (prompt.includes('performing git operations in a feature worktree'))
      return mergeCommitResult();

    // Merge squash (PR): merge-prompts.ts:131
    if (prompt.includes('merging a pull request via the GitHub CLI')) return mergeSquashResult();

    // Merge squash (local): merge-prompts.ts:168
    if (prompt.includes('performing a local merge')) return mergeSquashResult();

    // CI fix: merge.prompt.ts:28
    if (prompt.includes('fixing a CI failure')) return CI_FIX_RESULT;

    // Investigation, discovery and triage (specs 123, 128, 129)
    return devStructuredAnswer(prompt) ?? '{}';
  }
}
