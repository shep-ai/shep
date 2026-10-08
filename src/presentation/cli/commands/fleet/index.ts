/**
 * Fleet Command Group
 *
 * shep fleet <status|triage|approve|pause|resume>
 */

import { Command } from 'commander';
import { createStatusCommand } from './status.command.js';
import { createTriageCommand } from './triage.command.js';
import { createApproveCommand } from './approve.command.js';
import { createPauseCommand, createResumeCommand } from './pause.command.js';

export function createFleetCommand(): Command {
  const fleet = new Command('fleet').description(
    'Manage and monitor fleets of parallel agents at scale'
  );

  fleet.addCommand(createStatusCommand());
  fleet.addCommand(createTriageCommand());
  fleet.addCommand(createApproveCommand());
  fleet.addCommand(createPauseCommand());
  fleet.addCommand(createResumeCommand());

  return fleet;
}
