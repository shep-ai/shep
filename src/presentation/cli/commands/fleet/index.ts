/**
 * Fleet Command Group
 *
 * shep fleet <status|triage|approve>
 */

import { Command } from 'commander';
import { createStatusCommand } from './status.command.js';
import { createTriageCommand } from './triage.command.js';
import { createApproveCommand } from './approve.command.js';

export function createFleetCommand(): Command {
  const fleet = new Command('fleet').description(
    'Manage and monitor fleets of parallel agents at scale'
  );

  fleet.addCommand(createStatusCommand());
  fleet.addCommand(createTriageCommand());
  fleet.addCommand(createApproveCommand());

  return fleet;
}
