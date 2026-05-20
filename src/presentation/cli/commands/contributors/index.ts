import { Command } from 'commander';
import { createWelcomePrCommand } from './welcome-pr.command.js';
import { createGroomIssueCommand } from './groom-issue.command.js';

export function createContributorsCommand(): Command {
  return new Command('contributors')
    .description('Contributor pipeline subcommands (entry points for GitHub Actions workflows).')
    .addCommand(createWelcomePrCommand())
    .addCommand(createGroomIssueCommand());
}
