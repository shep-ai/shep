/**
 * Feature Command Group
 *
 * Provides subcommands for managing features through the SDLC lifecycle.
 *
 * Usage:
 *   shep feat new <description>  # Create a new feature
 *   shep feat ls                 # List features
 *   shep feat show <id>          # Show feature details
 *   shep feat del <id>           # Delete a feature
 */

import { Command } from 'commander';
import { getCliI18n } from '../../i18n.js';
import { createNewCommand } from './new.command.js';
import { createLsCommand } from './ls.command.js';
import { createShowCommand } from './show.command.js';
import { createDelCommand } from './del.command.js';
import { createResumeCommand } from './resume.command.js';
import { createStartCommand } from './start.command.js';
import { createReviewCommand } from './review.command.js';
import { createApproveCommand } from './approve.command.js';
import { createRejectCommand } from './reject.command.js';
import { createLogsCommand } from './logs.command.js';
import { createAdoptCommand } from './adopt.command.js';
import { createArchiveCommand } from './archive.command.js';
import { createUnarchiveCommand } from './unarchive.command.js';
import { createFeedbackCommand } from './feedback.command.js';
import { createPromoteCommand } from './promote.command.js';

/**
 * Create the feat command group
 */
export function createFeatCommand(): Command {
  return new Command('feat')
    .description(getCliI18n().t('cli:commands.feat.description'))
    .addCommand(createNewCommand())
    .addCommand(createLsCommand())
    .addCommand(createShowCommand())
    .addCommand(createDelCommand())
    .addCommand(createResumeCommand())
    .addCommand(createStartCommand())
    .addCommand(createReviewCommand())
    .addCommand(createApproveCommand())
    .addCommand(createRejectCommand())
    .addCommand(createLogsCommand())
    .addCommand(createAdoptCommand())
    .addCommand(createArchiveCommand())
    .addCommand(createUnarchiveCommand())
    .addCommand(createFeedbackCommand())
    .addCommand(createPromoteCommand());
}
