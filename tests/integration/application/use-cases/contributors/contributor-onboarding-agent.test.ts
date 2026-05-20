/**
 * Contributor-Onboarding Agent — golden-path integration test (spec 097, task-38).
 *
 * Wires the registered contributor-onboarding agent end-to-end:
 *   1. Loads the real `prompts/contributor-onboarding/system.md` and
 *      `prompts/contributor-onboarding/output-schema.md` files from disk.
 *   2. Registers the agent through `RegisterContributorOnboardingAgentUseCase`
 *      (real `CreateCustomAgentUseCase` + `UpsertAgentPromptOverrideUseCase`,
 *      backed by in-memory repositories).
 *   3. Invokes `IAgentExecutorProvider` with a deterministic mock that
 *      replays a recorded fixture response.
 *   4. Validates that the response conforms to the TypeSpec
 *      `ContributorOnboardingAgentOutput` shape (typed enum matching, not
 *      stringly-typed) and that every field obeys the contract documented
 *      in the system prompt.
 *
 * Determinism: the mock executor returns a fixture so tests are not
 * gated on a real LLM. The test still exercises every layer except the
 * provider implementation.
 */

import 'reflect-metadata';
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { readFile } from 'node:fs/promises';
import * as path from 'node:path';
import * as url from 'node:url';

import { CreateCustomAgentUseCase } from '@/application/use-cases/agents/create-custom-agent.use-case.js';
import { UpsertAgentPromptOverrideUseCase } from '@/application/use-cases/agents/upsert-agent-prompt-override.use-case.js';
import {
  CONTRIBUTOR_ONBOARDING_AGENT_TYPE,
  CONTRIBUTOR_ONBOARDING_OUTPUT_SCHEMA_PROMPT_ID,
  CONTRIBUTOR_ONBOARDING_READ_ONLY_TOOLS,
  CONTRIBUTOR_ONBOARDING_SYSTEM_PROMPT_ID,
  RegisterContributorOnboardingAgentUseCase,
} from '@/application/use-cases/contributors/register-contributor-onboarding-agent.use-case.js';
import { InMemoryCustomAgentRepository } from '@/infrastructure/adapters/in-memory/in-memory-custom-agent.repository.js';
import { InMemoryAgentPromptOverrideRepository } from '@/infrastructure/adapters/in-memory/in-memory-agent-prompt-override.repository.js';
import {
  ContributionDifficulty,
  ContributorLane,
  type ContributorOnboardingAgentOutput,
} from '@/domain/generated/output.js';
import type { IAgentExecutor } from '@/application/ports/output/agents/agent-executor.interface.js';
import type { IAgentExecutorProvider } from '@/application/ports/output/agents/agent-executor-provider.interface.js';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../../../../..');
const PROMPTS_DIR = path.join(REPO_ROOT, 'prompts', 'contributor-onboarding');
const FIXTURES_DIR = path.resolve(__dirname, '../../../../fixtures/contributor-onboarding');

interface FixtureIssue {
  title: string;
  description: string;
  labels: string[];
  url: string;
  source: string;
}

const ENUM_LANE_VALUES = new Set<string>(Object.values(ContributorLane));
const ENUM_DIFFICULTY_VALUES = new Set<string>(Object.values(ContributionDifficulty));

function fakeProviderReturning(jsonResult: string): {
  provider: IAgentExecutorProvider;
  executor: IAgentExecutor;
} {
  const executor: IAgentExecutor = {
    agentType: 'ClaudeCode' as never,
    execute: vi.fn().mockResolvedValue({ result: jsonResult }),
    executeStream: vi.fn(),
    supportsFeature: vi.fn().mockReturnValue(true),
  };
  return {
    executor,
    provider: { getExecutor: vi.fn().mockResolvedValue(executor) },
  };
}

/**
 * Asserts the parsed JSON satisfies the TypeSpec
 * `ContributorOnboardingAgentOutput` contract — every field is typed
 * against the matching enum, not against a raw string.
 */
function assertConformsToSchema(raw: unknown): asserts raw is ContributorOnboardingAgentOutput {
  expect(raw).toBeTypeOf('object');
  expect(raw).not.toBeNull();
  const obj = raw as Record<string, unknown>;

  // lane
  expect(typeof obj.lane).toBe('string');
  expect(ENUM_LANE_VALUES.has(obj.lane as string)).toBe(true);

  // difficulty
  expect(typeof obj.difficulty).toBe('string');
  expect(ENUM_DIFFICULTY_VALUES.has(obj.difficulty as string)).toBe(true);

  // acceptanceCriteria
  expect(typeof obj.acceptanceCriteria).toBe('string');
  expect((obj.acceptanceCriteria as string).length).toBeGreaterThan(0);
  expect(obj.acceptanceCriteria as string).toMatch(/- \[ \] /);

  // suggestedLabels
  expect(Array.isArray(obj.suggestedLabels)).toBe(true);
  for (const label of obj.suggestedLabels as unknown[]) {
    expect(typeof label).toBe('string');
    expect((label as string).length).toBeGreaterThan(0);
  }
  expect(obj.suggestedLabels).toEqual(
    expect.arrayContaining([`lane:${obj.lane as string}`, `difficulty:${obj.difficulty as string}`])
  );

  // welcomeComment is optional but, when present, must be a non-empty string
  if (obj.welcomeComment !== undefined) {
    expect(typeof obj.welcomeComment).toBe('string');
    expect((obj.welcomeComment as string).length).toBeGreaterThan(0);
  }
}

describe('Contributor-onboarding agent (integration, golden path)', () => {
  let systemBody: string;
  let outputSchemaBody: string;
  let issueFixture: FixtureIssue;
  let agentResponseFixture: string;

  let agentsRepo: InMemoryCustomAgentRepository;
  let promptsRepo: InMemoryAgentPromptOverrideRepository;
  let registration: RegisterContributorOnboardingAgentUseCase;

  beforeAll(async () => {
    [systemBody, outputSchemaBody, issueFixture, agentResponseFixture] = await Promise.all([
      readFile(path.join(PROMPTS_DIR, 'system.md'), 'utf-8'),
      readFile(path.join(PROMPTS_DIR, 'output-schema.md'), 'utf-8'),
      readFile(path.join(FIXTURES_DIR, 'issue-docs-pnpm.json'), 'utf-8').then(
        (s) => JSON.parse(s) as FixtureIssue
      ),
      readFile(path.join(FIXTURES_DIR, 'agent-response-docs-pnpm.json'), 'utf-8'),
    ]);
  });

  beforeEach(() => {
    agentsRepo = new InMemoryCustomAgentRepository();
    promptsRepo = new InMemoryAgentPromptOverrideRepository();
    registration = new RegisterContributorOnboardingAgentUseCase(
      agentsRepo,
      new CreateCustomAgentUseCase(agentsRepo, promptsRepo),
      new UpsertAgentPromptOverrideUseCase(promptsRepo, agentsRepo)
    );
  });

  it('registers the agent with the real prompt files and a read-only tool surface', async () => {
    const result = await registration.execute({
      systemPromptBody: systemBody,
      outputSchemaBody,
    });

    expect(result.created).toBe(true);
    expect(result.agent.agentType).toBe(CONTRIBUTOR_ONBOARDING_AGENT_TYPE);
    expect(result.allowedTools).toEqual([...CONTRIBUTOR_ONBOARDING_READ_ONLY_TOOLS]);

    const slots = await promptsRepo.listForAgent(CONTRIBUTOR_ONBOARDING_AGENT_TYPE);
    const slotIds = slots.map((s) => s.promptId).sort();
    expect(slotIds).toEqual(
      [
        CONTRIBUTOR_ONBOARDING_OUTPUT_SCHEMA_PROMPT_ID,
        CONTRIBUTOR_ONBOARDING_SYSTEM_PROMPT_ID,
      ].sort()
    );
    const persistedSystem = slots.find(
      (s) => s.promptId === CONTRIBUTOR_ONBOARDING_SYSTEM_PROMPT_ID
    );
    expect(persistedSystem?.body).toBe(systemBody);
    expect(persistedSystem?.body).toContain('contributor-onboarding agent');
  });

  it('runs the agent against a fixture issue and returns output that conforms to ContributorOnboardingAgentOutput', async () => {
    await registration.execute({ systemPromptBody: systemBody, outputSchemaBody });
    const slots = await promptsRepo.listForAgent(CONTRIBUTOR_ONBOARDING_AGENT_TYPE);
    const systemSlot = slots.find((s) => s.promptId === CONTRIBUTOR_ONBOARDING_SYSTEM_PROMPT_ID);
    expect(systemSlot).toBeDefined();

    const { provider, executor } = fakeProviderReturning(agentResponseFixture);

    const userPrompt = [
      `Title: ${issueFixture.title}`,
      `Body: ${issueFixture.description}`,
      `Labels: ${issueFixture.labels.join(', ')}`,
    ].join('\n');

    const exec = await provider.getExecutor();
    const response = await exec.execute(userPrompt, {
      systemPrompt: systemSlot?.body ?? '',
      allowedTools: [...CONTRIBUTOR_ONBOARDING_READ_ONLY_TOOLS],
      outputSchema: {
        type: 'object',
        properties: {
          lane: { type: 'string' },
          difficulty: { type: 'string' },
          acceptanceCriteria: { type: 'string' },
          suggestedLabels: { type: 'array', items: { type: 'string' } },
          welcomeComment: { type: 'string' },
        },
        required: ['lane', 'difficulty', 'acceptanceCriteria', 'suggestedLabels'],
      },
    });

    expect(executor.execute).toHaveBeenCalledTimes(1);

    const parsed: unknown = JSON.parse(response.result);
    assertConformsToSchema(parsed);

    // For the docs/pnpm fixture: assert the typed enum values flowed through.
    expect(parsed.lane).toBe(ContributorLane.Docs);
    expect(parsed.difficulty).toBe(ContributionDifficulty.GoodFirst);
    expect(parsed.welcomeComment).toBeDefined();
    expect(parsed.welcomeComment).toContain('docs');
  });

  it('the executor is invoked only with read-only tools (FR-35)', async () => {
    await registration.execute({ systemPromptBody: systemBody, outputSchemaBody });
    const { provider, executor } = fakeProviderReturning(agentResponseFixture);

    const exec = await provider.getExecutor();
    await exec.execute('Title: docs: x\nBody: y', {
      allowedTools: [...CONTRIBUTOR_ONBOARDING_READ_ONLY_TOOLS],
    });

    const calls = (executor.execute as unknown as { mock: { calls: unknown[][] } }).mock.calls;
    expect(calls.length).toBe(1);
    const callOptions = calls[0]?.[1] as { allowedTools?: string[] } | undefined;
    expect(callOptions?.allowedTools).toBeDefined();
    for (const tool of callOptions?.allowedTools ?? []) {
      expect(['Bash', 'Write', 'Edit', 'NotebookEdit', 'TodoWrite']).not.toContain(tool);
    }
  });
});
