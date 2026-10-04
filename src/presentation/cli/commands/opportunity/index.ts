/**
 * Opportunity Command Group (spec 126)
 *
 * Bets backed by signals, ranked by value per review hour; the line is what
 * fits the space's weekly review capacity.
 *
 * Usage:
 *   shep opportunity add <title> --hours <h> [--confidence] [--strategic] [--problem] [--space]
 *   shep opportunity ls [--space]
 *   shep opportunity show <opportunity>
 *   shep opportunity estimate <opportunity> [--hours] [--confidence] [--strategic] [--problem]
 *   shep opportunity link <signal> <opportunity> | unlink <signal>
 *   shep opportunity accept <opportunity> | drop <opportunity> --reason <text>
 *   shep opportunity build <opportunity> --project <project>
 *   shep opportunity weights [--space] [--reach] [--revenue] [--urgency] [--strategic] [--capacity]
 */

import { Command } from 'commander';
import { getCliI18n } from '../../i18n.js';
import {
  createAddCommand,
  createDecisionCommands,
  createEstimateCommand,
  createLinkCommands,
} from './decide.command.js';
import { createLsCommand, createShowCommand, createWeightsCommand } from './board.command.js';

export function createOpportunityCommand(): Command {
  const command = new Command('opportunity')
    .description(getCliI18n().t('cli:commands.opportunity.description'))
    .addCommand(createAddCommand())
    .addCommand(createLsCommand())
    .addCommand(createShowCommand())
    .addCommand(createEstimateCommand());
  for (const sub of [...createLinkCommands(), ...createDecisionCommands()]) {
    command.addCommand(sub);
  }
  return command.addCommand(createWeightsCommand());
}
