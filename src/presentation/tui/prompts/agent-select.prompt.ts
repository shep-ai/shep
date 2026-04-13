/**
 * Agent Select Prompt Configuration
 *
 * Configuration for the @inquirer/select prompt that lets users
 * choose their AI coding agent.
 */

import { AgentType } from '@/domain/generated/output.js';
import { getTuiI18n } from '../i18n.js';
import { shepTheme } from '../themes/shep.theme.js';

/**
 * Creates the @inquirer/select configuration for selecting an AI coding agent.
 *
 * Active agents are selectable. Agents not yet implemented are shown
 * as disabled with a "Coming Soon" badge.
 */
export function createAgentSelectConfig() {
  const t = getTuiI18n().t;
  return {
    message: t('tui:prompts.selectAgent.message'),
    choices: [
      {
        name: t('tui:prompts.selectAgent.choices.claudeCode.name'),
        value: AgentType.ClaudeCode,
        description: t('tui:prompts.selectAgent.choices.claudeCode.description'),
      },
      {
        name: t('tui:prompts.selectAgent.choices.geminiCli.name'),
        value: AgentType.GeminiCli,
        description: t('tui:prompts.selectAgent.choices.geminiCli.description'),
      },
      {
        name: t('tui:prompts.selectAgent.choices.codexCli.name'),
        value: AgentType.CodexCli,
        description: t('tui:prompts.selectAgent.choices.codexCli.description'),
      },
      {
        name: t('tui:prompts.selectAgent.choices.copilotCli.name'),
        value: AgentType.CopilotCli,
        description: t('tui:prompts.selectAgent.choices.copilotCli.description'),
      },
      {
        name: t('tui:prompts.selectAgent.choices.cursor.name'),
        value: AgentType.Cursor,
        description: t('tui:prompts.selectAgent.choices.cursor.description'),
      },
      {
        name: t('tui:prompts.selectAgent.choices.cline.name'),
        value: AgentType.Cline,
        description: t('tui:prompts.selectAgent.choices.cline.description'),
      },
      {
        name: t('tui:prompts.selectAgent.choices.devMock.name'),
        value: AgentType.Dev,
        description: t('tui:prompts.selectAgent.choices.devMock.description'),
      },
      {
        name: t('tui:prompts.selectAgent.choices.openRouter.name'),
        value: AgentType.OpenRouter,
        description: t('tui:prompts.selectAgent.choices.openRouter.description'),
      },
      {
        name: t('tui:prompts.selectAgent.choices.togetherAi.name'),
        value: AgentType.TogetherAi,
        description: t('tui:prompts.selectAgent.choices.togetherAi.description'),
      },
      {
        name: t('tui:prompts.selectAgent.choices.ollama.name'),
        value: AgentType.Ollama,
        description: t('tui:prompts.selectAgent.choices.ollama.description'),
      },
      {
        name: t('tui:prompts.selectAgent.choices.aider.name'),
        value: AgentType.Aider,
        disabled: t('tui:prompts.selectAgent.choices.aider.disabled'),
      },
      {
        name: t('tui:prompts.selectAgent.choices.continue.name'),
        value: AgentType.Continue,
        disabled: t('tui:prompts.selectAgent.choices.continue.disabled'),
      },
    ],
    theme: shepTheme,
  };
}
