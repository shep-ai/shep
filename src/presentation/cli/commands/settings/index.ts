/**
 * Settings Command Group
 *
 * Provides subcommands for managing Shep global settings.
 * Running `shep settings` with no subcommand launches the full setup wizard.
 *
 * Usage:
 *   shep settings           # Launch full setup wizard (agent + IDE + workflow)
 *   shep settings show      # Display current settings
 *   shep settings init      # Initialize settings to defaults
 *   shep settings agent     # Configure AI coding agent
 *   shep settings ide       # Configure preferred IDE
 *   shep settings workflow  # Configure workflow defaults
 *   shep settings model     # Configure default LLM model
 *   shep settings language  # Configure display language
 */

import { Command } from 'commander';
import { createShowCommand } from './show.command.js';
import { createInitCommand } from './init.command.js';
import { createAgentCommand } from './agent.command.js';
import { createIdeCommand } from './ide.command.js';
import { createWorkflowCommand } from './workflow.command.js';
import { createModelCommand } from './model.command.js';
import { createLanguageCommand } from './language.command.js';
import { createMessagingCommand } from './messaging.command.js';
import { onboardingWizard } from '../../../tui/wizards/onboarding/onboarding.wizard.js';
import { messages } from '../../ui/index.js';
import { getCliI18n } from '../../i18n.js';

/**
 * Create the settings command group
 */
export function createSettingsCommand(): Command {
  const cmd = new Command('settings')
    .description(getCliI18n().t('cli:commands.settings.description'))
    .addCommand(createShowCommand())
    .addCommand(createInitCommand())
    .addCommand(createAgentCommand())
    .addCommand(createIdeCommand())
    .addCommand(createWorkflowCommand())
    .addCommand(createModelCommand())
    .addCommand(createLanguageCommand())
    .addCommand(createMessagingCommand());

  // Default action: launch the full setup wizard when no subcommand is given
  cmd.action(async () => {
    try {
      await onboardingWizard();
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      messages.error(getCliI18n().t('cli:commands.settings.wizardFailed'), err);
      process.exitCode = 1;
    }
  });

  return cmd;
}
