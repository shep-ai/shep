/**
 * RegisterContributorOnboardingAgentUseCase — spec 097, FR-34..FR-35 / task-37.
 *
 * Registers the contributor-onboarding agent through the existing custom-agent
 * rail (`CreateCustomAgentUseCase`) — no new built-in agent kind. The system
 * prompt and the structured-output schema reference are stored as agent prompt
 * slots so they can be edited from the agent editor and forked by adopting
 * projects, while the typed schema itself lives in TypeSpec
 * (`tsp/agents/contributor-onboarding-output.tsp`).
 *
 * Re-running registration is idempotent: when the agent already exists,
 * each prompt slot is upserted (which bumps `version` by 1 instead of
 * inserting a duplicate).
 *
 * Tool surface is the read-only constant `CONTRIBUTOR_ONBOARDING_READ_ONLY_TOOLS`
 * (FR-35) — the agent has NO write capabilities. Mutations to GitHub or
 * Discord flow through downstream use cases gated by `ISupervisorAgent`.
 */
import { inject, injectable } from 'tsyringe';

import type { ICustomAgentRepository } from '../../ports/output/repositories/custom-agent-repository.interface.js';
import type { CustomAgent, AgentPromptOverride } from '../../../domain/generated/output.js';
import { CreateCustomAgentUseCase } from '../agents/create-custom-agent.use-case.js';
import { UpsertAgentPromptOverrideUseCase } from '../agents/upsert-agent-prompt-override.use-case.js';

/** Stable agent type identifier — used everywhere the agent is referenced. */
export const CONTRIBUTOR_ONBOARDING_AGENT_TYPE = 'contributor-onboarding';

/** Prompt-slot id for the system prompt body. */
export const CONTRIBUTOR_ONBOARDING_SYSTEM_PROMPT_ID = 'system';

/** Prompt-slot id for the human-readable output schema reference. */
export const CONTRIBUTOR_ONBOARDING_OUTPUT_SCHEMA_PROMPT_ID = 'output-schema';

/**
 * Read-only tool surface granted to the contributor-onboarding agent (FR-35).
 *
 * Excludes every write-capable tool (Bash, Write, Edit, NotebookEdit,
 * TodoWrite) and every Shep write port. The agent inspects issue payloads
 * and existing repo content; mutations happen elsewhere through use cases
 * that route writes through the supervisor approval gate.
 */
export const CONTRIBUTOR_ONBOARDING_READ_ONLY_TOOLS: readonly string[] = Object.freeze([
  'Read',
  'Grep',
  'Glob',
  'WebFetch',
  'WebSearch',
]);

export interface RegisterContributorOnboardingAgentInput {
  /** System prompt body (loaded from `prompts/contributor-onboarding/system.md`). */
  systemPromptBody: string;
  /** Output-schema reference body (loaded from `prompts/contributor-onboarding/output-schema.md`). */
  outputSchemaBody: string;
  /** Author of the registration; defaults to `'shep'`. */
  createdBy?: string;
}

export interface RegisterContributorOnboardingAgentResult {
  agent: CustomAgent;
  systemPrompt: AgentPromptOverride;
  outputSchema: AgentPromptOverride;
  /** True when this call created the agent (vs. updating prompts on an existing one). */
  created: boolean;
  /** Read-only tool surface the agent is invoked with (FR-35). */
  allowedTools: readonly string[];
}

@injectable()
export class RegisterContributorOnboardingAgentUseCase {
  constructor(
    @inject('ICustomAgentRepository')
    private readonly agents: ICustomAgentRepository,
    @inject(CreateCustomAgentUseCase)
    private readonly createAgent: CreateCustomAgentUseCase,
    @inject(UpsertAgentPromptOverrideUseCase)
    private readonly upsertPrompt: UpsertAgentPromptOverrideUseCase
  ) {}

  async execute(
    input: RegisterContributorOnboardingAgentInput
  ): Promise<RegisterContributorOnboardingAgentResult> {
    if (!input.systemPromptBody.trim()) {
      throw new Error('systemPromptBody must be a non-empty string');
    }
    if (!input.outputSchemaBody.trim()) {
      throw new Error('outputSchemaBody must be a non-empty string');
    }
    const createdBy = input.createdBy ?? 'shep';

    const existing = await this.agents.findByType(CONTRIBUTOR_ONBOARDING_AGENT_TYPE);
    let agent: CustomAgent;
    let created = false;

    if (!existing) {
      const result = await this.createAgent.execute({
        agentType: CONTRIBUTOR_ONBOARDING_AGENT_TYPE,
        name: 'Contributor Onboarding',
        description:
          'Reads a GitHub issue and produces a structured grooming artifact ' +
          '(lane, difficulty, acceptance criteria, suggested labels, optional welcome).',
        createdBy,
      });
      agent = result.agent;
      created = true;
    } else {
      agent = existing;
    }

    const systemPrompt = await this.upsertPrompt.execute({
      agentType: CONTRIBUTOR_ONBOARDING_AGENT_TYPE,
      promptId: CONTRIBUTOR_ONBOARDING_SYSTEM_PROMPT_ID,
      body: input.systemPromptBody,
      createdBy,
    });

    const outputSchema = await this.upsertPrompt.execute({
      agentType: CONTRIBUTOR_ONBOARDING_AGENT_TYPE,
      promptId: CONTRIBUTOR_ONBOARDING_OUTPUT_SCHEMA_PROMPT_ID,
      body: input.outputSchemaBody,
      createdBy,
    });

    return {
      agent,
      systemPrompt,
      outputSchema,
      created,
      allowedTools: CONTRIBUTOR_ONBOARDING_READ_ONLY_TOOLS,
    };
  }
}
