import { Command } from 'commander';
import { createWelcomePrCommand } from './welcome-pr.command.js';
import { createGroomIssueCommand } from './groom-issue.command.js';
import { createStaleIssuesCommand } from './stale-issues.command.js';
import { createRecapCommand } from './recap.command.js';

export function createContributorsCommand(): Command {
  return new Command('contributors')
    .description('Contributor pipeline subcommands (entry points for GitHub Actions workflows).')
    .addCommand(createWelcomePrCommand())
    .addCommand(createGroomIssueCommand())
    .addCommand(createStaleIssuesCommand())
    .addCommand(createRecapCommand());
}
