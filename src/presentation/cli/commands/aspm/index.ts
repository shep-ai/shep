/**
 * `shep aspm` parent command (feature 098, phase 10).
 *
 * Composes the six ASPM subcommands (ingest, findings, campaigns,
 * posture, exceptions, ai-review) into a single Commander group. Every
 * leaf subcommand routes through a use case resolved from the DI
 * container — the command modules themselves stay thin (parse →
 * use-case-call → formatted output).
 */

import { Command } from 'commander';
import { createAspmIngestCommand } from './aspm-ingest-command.js';
import { createAspmFindingsCommand } from './aspm-findings-command.js';
import { createAspmCampaignsCommand } from './aspm-campaigns-command.js';
import { createAspmPostureCommand } from './aspm-posture-command.js';
import { createAspmExceptionsCommand } from './aspm-exceptions-command.js';
import { createAspmAiReviewCommand } from './aspm-ai-review-command.js';

export function createAspmCommand(): Command {
  const cmd = new Command('aspm').description(
    'Application Security Posture Management — findings, campaigns, posture, exceptions, AI-review'
  );

  cmd.addCommand(createAspmIngestCommand());
  cmd.addCommand(createAspmFindingsCommand());
  cmd.addCommand(createAspmCampaignsCommand());
  cmd.addCommand(createAspmPostureCommand());
  cmd.addCommand(createAspmExceptionsCommand());
  cmd.addCommand(createAspmAiReviewCommand());

  return cmd;
}
