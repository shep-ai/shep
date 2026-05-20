/**
 * `shep aspm` parent command (feature 098, phase 10).
 *
 * Composes the six ASPM subcommands (ingest, findings, campaigns,
 * posture, exceptions, ai-review) into a single Commander group. Every
 * leaf subcommand routes through a use case resolved from the DI
 * container — the command modules themselves stay thin (parse →
 * use-case-call → formatted output).
 *
 * The entire surface is gated behind the `aspm` feature flag. When the
 * flag is off the command is registered but hidden from `--help` and
 * any invocation prints a one-liner pointing to `shep settings`. Mirrors
 * the supervisor command's collaboration-flag pattern so byte-identical
 * default CLI output is preserved unless the user opts in.
 */

import { Command } from 'commander';
import { getSettings, hasSettings } from '@/infrastructure/services/settings.service.js';
import { messages } from '../../ui/index.js';
import { createAspmIngestCommand } from './aspm-ingest-command.js';
import { createAspmFindingsCommand } from './aspm-findings-command.js';
import { createAspmCampaignsCommand } from './aspm-campaigns-command.js';
import { createAspmPostureCommand } from './aspm-posture-command.js';
import { createAspmExceptionsCommand } from './aspm-exceptions-command.js';
import { createAspmAiReviewCommand } from './aspm-ai-review-command.js';
import { createAspmScanCommand, createAspmRescanCommand } from './aspm-scan-command.js';

function isAspmEnabled(): boolean {
  if (!hasSettings()) return false;
  return getSettings().featureFlags?.aspm === true;
}

export function createAspmCommand(): Command {
  const cmd = new Command('aspm').description(
    'Application Security Posture Management — findings, campaigns, posture, exceptions, AI-review'
  );

  cmd.addCommand(createAspmScanCommand());
  cmd.addCommand(createAspmRescanCommand());
  cmd.addCommand(createAspmIngestCommand());
  cmd.addCommand(createAspmFindingsCommand());
  cmd.addCommand(createAspmCampaignsCommand());
  cmd.addCommand(createAspmPostureCommand());
  cmd.addCommand(createAspmExceptionsCommand());
  cmd.addCommand(createAspmAiReviewCommand());

  if (!isAspmEnabled()) {
    // Hide the surface from --help and short-circuit any invocation so
    // the default CLI output is unchanged for users who haven't opted in.
    (cmd as unknown as { _hidden: boolean })._hidden = true;
    cmd.hook('preAction', () => {
      messages.error(
        'The ASPM module is disabled. Enable the "aspm" feature flag in settings to use `shep aspm`.'
      );
      process.exit(1);
    });
  }

  return cmd;
}
