/**
 * Infrastructure adapter: builds the Shep application-creation brief,
 * split into two slots:
 *
 * - `systemPrompt` — persona + role + mission + tech stack + workflow +
 *   quality bar + user-interaction policy + definition of done, plus
 *   any caller-provided extras and attachments. This is the agent's
 *   foundational instructions; it goes into the SDK `systemPrompt`
 *   slot so it applies to every turn and never clutters the chat UI.
 * - `userMessage` — the user's verbatim description, trimmed. This is
 *   the first user message of the interactive session and shows up in
 *   the chat thread as-is.
 *
 * Implements the {@link IApplicationCreationPromptBuilder} application
 * port. The static section text lives next to this file under
 * `./prompts/`; this builder threads them together in a fixed order
 * joined by a horizontal rule.
 */

import { injectable } from 'tsyringe';

import type {
  ApplicationCreationPromptInput,
  ApplicationCreationPromptOutput,
  ApplicationCreationPromptSectionKey,
  ApplicationCreationPromptSections,
  IApplicationCreationPromptBuilder,
} from '../../../../application/ports/output/services/application-creation-prompt-builder.interface.js';

import { BRAND } from './prompts/brand.js';
import { ROLE } from './prompts/role.js';
import { MISSION } from './prompts/mission.js';
import { TECH_STACK } from './prompts/tech-stack.js';
import { WORKFLOW } from './prompts/workflow.js';
import { QUALITY } from './prompts/quality.js';
import { USER_INTERACTION } from './prompts/user-interaction.js';
import { OUTPUT_CONTRACT } from './prompts/output-contract.js';
import { renderAttachments, renderWorkspace } from './prompts/dynamic.js';

/** Default content for every static section. Override per-call via `input.overrides`. */
export const DEFAULT_SECTIONS: ApplicationCreationPromptSections = {
  brand: BRAND,
  role: ROLE,
  mission: MISSION,
  techStack: TECH_STACK,
  workflow: WORKFLOW,
  quality: QUALITY,
  userInteraction: USER_INTERACTION,
  outputContract: OUTPUT_CONTRACT,
};

/**
 * Order in which sections are emitted. `brand` goes first so the agent's
 * persona is established before any technical instructions.
 */
const SECTION_ORDER: readonly ApplicationCreationPromptSectionKey[] = [
  'brand',
  'role',
  'mission',
  'techStack',
  'workflow',
  'quality',
  'userInteraction',
  'outputContract',
];

const SECTION_SEPARATOR = '\n\n---\n\n';

@injectable()
export class ApplicationCreationPromptBuilder implements IApplicationCreationPromptBuilder {
  build(input: ApplicationCreationPromptInput): ApplicationCreationPromptOutput {
    if (!input.description?.trim()) {
      throw new Error('ApplicationCreationPromptBuilder.build: description is required');
    }

    const sections: ApplicationCreationPromptSections = {
      ...DEFAULT_SECTIONS,
      ...input.overrides,
    };

    // Workspace facts (cwd, platform, "directory is empty, do not ls")
    // go at the VERY TOP of the prompt — this is the single most
    // important ground-truth block and long system prompts get
    // truncated attention toward the bottom. We want the agent to see
    // "directory is empty, start scaffolding" before any other section.
    const parts: string[] = [];
    const workspaceBlock = renderWorkspace(input.workspace);
    if (workspaceBlock) parts.push(workspaceBlock);

    parts.push(...SECTION_ORDER.map((key) => sections[key]));

    if (input.extras && input.extras.length > 0) {
      parts.push(...input.extras);
    }

    const attachmentsBlock = renderAttachments(input.attachments);
    if (attachmentsBlock) parts.push(attachmentsBlock);

    return {
      systemPrompt: parts.join(SECTION_SEPARATOR),
      userMessage: input.description.trim(),
    };
  }
}
