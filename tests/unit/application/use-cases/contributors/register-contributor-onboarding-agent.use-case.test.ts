/**
 * RegisterContributorOnboardingAgentUseCase — unit tests (spec 097, task-37).
 *
 * Asserts:
 *  (a) registration creates a custom-agent row + the system + output-schema
 *      prompt slots
 *  (b) re-running registration is idempotent — bumps the prompt revision
 *      instead of inserting a duplicate agent
 *  (c) the registered tool surface contains only read-only tools
 *      (no Bash, Write, Edit, NotebookEdit, IGitHubIssueWriter, …)
 */

import 'reflect-metadata';
import { describe, it, expect, beforeEach } from 'vitest';

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

const SYSTEM_BODY = '# Contributor-Onboarding Agent\n\nYou are the contributor-onboarding agent.';
const OUTPUT_SCHEMA_BODY =
  '# Output Schema\n\nReturn JSON conforming to ContributorOnboardingAgentOutput.';

describe('RegisterContributorOnboardingAgentUseCase', () => {
  let agentsRepo: InMemoryCustomAgentRepository;
  let promptsRepo: InMemoryAgentPromptOverrideRepository;
  let createAgent: CreateCustomAgentUseCase;
  let upsertPrompt: UpsertAgentPromptOverrideUseCase;
  let useCase: RegisterContributorOnboardingAgentUseCase;

  beforeEach(() => {
    agentsRepo = new InMemoryCustomAgentRepository();
    promptsRepo = new InMemoryAgentPromptOverrideRepository();
    createAgent = new CreateCustomAgentUseCase(agentsRepo, promptsRepo);
    upsertPrompt = new UpsertAgentPromptOverrideUseCase(promptsRepo, agentsRepo);
    useCase = new RegisterContributorOnboardingAgentUseCase(agentsRepo, createAgent, upsertPrompt);
  });

  it('creates the contributor-onboarding custom agent and seeds its prompt slots', async () => {
    const result = await useCase.execute({
      systemPromptBody: SYSTEM_BODY,
      outputSchemaBody: OUTPUT_SCHEMA_BODY,
    });

    expect(result.agent.agentType).toBe(CONTRIBUTOR_ONBOARDING_AGENT_TYPE);
    expect(result.created).toBe(true);

    const persisted = await agentsRepo.findByType(CONTRIBUTOR_ONBOARDING_AGENT_TYPE);
    expect(persisted).not.toBeNull();

    const slots = await promptsRepo.listForAgent(CONTRIBUTOR_ONBOARDING_AGENT_TYPE);
    const slotIds = slots.map((s) => s.promptId).sort();
    expect(slotIds).toEqual(
      [
        CONTRIBUTOR_ONBOARDING_OUTPUT_SCHEMA_PROMPT_ID,
        CONTRIBUTOR_ONBOARDING_SYSTEM_PROMPT_ID,
      ].sort()
    );

    const system = slots.find((s) => s.promptId === CONTRIBUTOR_ONBOARDING_SYSTEM_PROMPT_ID);
    const schema = slots.find((s) => s.promptId === CONTRIBUTOR_ONBOARDING_OUTPUT_SCHEMA_PROMPT_ID);
    expect(system?.body).toBe(SYSTEM_BODY);
    expect(schema?.body).toBe(OUTPUT_SCHEMA_BODY);
    expect(system?.version).toBe(1);
    expect(schema?.version).toBe(1);
  });

  it('is idempotent: re-running bumps prompt versions without duplicating the agent', async () => {
    await useCase.execute({
      systemPromptBody: SYSTEM_BODY,
      outputSchemaBody: OUTPUT_SCHEMA_BODY,
    });

    const updatedSystem = `${SYSTEM_BODY}\n\nRevision 2.`;
    const updatedSchema = `${OUTPUT_SCHEMA_BODY}\n\nRevision 2.`;
    const second = await useCase.execute({
      systemPromptBody: updatedSystem,
      outputSchemaBody: updatedSchema,
    });

    expect(second.created).toBe(false);

    const all = await agentsRepo.listAll();
    expect(all).toHaveLength(1);

    const slots = await promptsRepo.listForAgent(CONTRIBUTOR_ONBOARDING_AGENT_TYPE);
    expect(slots).toHaveLength(2);
    const system = slots.find((s) => s.promptId === CONTRIBUTOR_ONBOARDING_SYSTEM_PROMPT_ID);
    const schema = slots.find((s) => s.promptId === CONTRIBUTOR_ONBOARDING_OUTPUT_SCHEMA_PROMPT_ID);
    expect(system?.body).toBe(updatedSystem);
    expect(schema?.body).toBe(updatedSchema);
    expect(system?.version).toBe(2);
    expect(schema?.version).toBe(2);
  });

  it('exposes a read-only tool surface that excludes write capabilities', async () => {
    const result = await useCase.execute({
      systemPromptBody: SYSTEM_BODY,
      outputSchemaBody: OUTPUT_SCHEMA_BODY,
    });

    const tools = result.allowedTools;
    // Sanity: contains the read tools we actually need
    expect(tools).toEqual(expect.arrayContaining(['Read', 'Grep', 'Glob']));

    // Hard guarantee: no write-capable tools (FR-35).
    const forbidden = ['Bash', 'Write', 'Edit', 'NotebookEdit', 'TodoWrite'];
    for (const tool of forbidden) {
      expect(tools).not.toContain(tool);
    }

    // The exported constant is the same shape as the result.
    expect([...tools]).toEqual([...CONTRIBUTOR_ONBOARDING_READ_ONLY_TOOLS]);
  });

  it('rejects empty prompt bodies', async () => {
    await expect(
      useCase.execute({ systemPromptBody: '', outputSchemaBody: OUTPUT_SCHEMA_BODY })
    ).rejects.toThrow(/systemPromptBody/);
    await expect(
      useCase.execute({ systemPromptBody: SYSTEM_BODY, outputSchemaBody: '' })
    ).rejects.toThrow(/outputSchemaBody/);
  });
});
