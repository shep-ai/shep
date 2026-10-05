/**
 * Incident Command Group (spec 129)
 *
 * Production incidents: open, triage with an agent, act on the workload
 * (restart, rollback, scale) under the space's policy, and resolve with a
 * postmortem.
 *
 * Usage:
 *   shep incident open <title> [--space] [--severity] [--workload --namespace --context]
 *   shep incident ls [--open] | show <incident> | note <incident> <text>
 *   shep incident triage <incident> [--agent]
 *   shep incident act <incident> <restart|rollback|scale> [--replicas] [--reason]
 *   shep incident approve <action> | reject <action> [--reason]
 *   shep incident resolve <incident> [--postmortem <markdown>]
 */

import { Command } from 'commander';
import { getCliI18n } from '../../i18n.js';
import {
  createLsCommand,
  createNoteCommand,
  createOpenCommand,
  createResolveCommand,
  createShowCommand,
} from './manage.command.js';
import { createActCommand, createDecisionCommands, createTriageCommand } from './act.command.js';

export function createIncidentCommand(): Command {
  const command = new Command('incident')
    .description(getCliI18n().t('cli:commands.incident.description'))
    .addCommand(createOpenCommand())
    .addCommand(createLsCommand())
    .addCommand(createShowCommand())
    .addCommand(createNoteCommand())
    .addCommand(createTriageCommand())
    .addCommand(createActCommand());
  for (const sub of createDecisionCommands()) command.addCommand(sub);
  return command.addCommand(createResolveCommand());
}
