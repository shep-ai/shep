/**
 * Project New Command
 *
 * Create a new PM project interactively or with options.
 *
 * Usage:
 *   shep project new
 *   shep project new --name "My Project" --prefix "MP"
 *   shep project new --name "Payments" --prefix "PAY" --repo ~/work/pay-api
 */

import { Command } from 'commander';
import { input } from '@inquirer/prompts';
import { container } from '@/infrastructure/di/container.js';
import { CreatePmProjectUseCase } from '@/application/use-cases/pm-projects/create-pm-project.use-case.js';
import { AdoptLocalRepositoryUseCase } from '@/application/use-cases/applications/adopt-local-repository.use-case.js';
import { expandHome } from '../../paths.js';
import { resolve as resolvePath } from 'node:path';
import { colors, messages } from '../../ui/index.js';

interface NewOptions {
  name?: string;
  prefix?: string;
  description?: string;
  repo?: string;
}

export function createNewCommand(): Command {
  return new Command('new')
    .description('Create a new project')
    .option('-n, --name <name>', 'Project name')
    .option('-p, --prefix <prefix>', 'Identifier prefix (1-5 uppercase letters)')
    .option('-d, --description <description>', 'Project description')
    .option(
      '-r, --repo <path>',
      "The project's repository: a local folder, registered as an application if it is not one yet"
    )
    .action(async (options: NewOptions) => {
      try {
        const name =
          options.name ??
          (await input({
            message: 'Project name:',
            validate: (v) => (v.trim().length > 0 ? true : 'Name is required'),
          }));
        const description = options.description;

        let prefix = options.prefix;
        if (!prefix) {
          const suggested = name
            .split(/[\s-_]+/)
            .map((w) => w[0])
            .join('')
            .toUpperCase()
            .slice(0, 5);
          prefix = await input({
            message: 'Identifier prefix (1-5 uppercase letters):',
            default: suggested || 'PRJ',
            validate: (v) =>
              /^[A-Z][A-Z0-9]{0,4}$/.test(v)
                ? true
                : 'Must be 1-5 uppercase alphanumeric characters starting with a letter',
          });
        }

        let applicationId: string | undefined;
        let repositoryPath: string | undefined;
        if (options.repo) {
          const adopted = await container
            .resolve(AdoptLocalRepositoryUseCase)
            .execute(resolvePath(expandHome(options.repo)));
          if (!adopted.ok) {
            messages.error(adopted.error);
            process.exitCode = 1;
            return;
          }
          applicationId = adopted.application.id;
          repositoryPath = adopted.application.repositoryPath;
        }

        const useCase = container.resolve(CreatePmProjectUseCase);
        const result = await useCase.execute({
          name,
          identifierPrefix: prefix,
          description,
          ...(applicationId ? { applicationId } : {}),
        });

        if (!result.ok) {
          messages.error(result.error);
          process.exitCode = 1;
          return;
        }

        messages.newline();
        messages.success('Project created');
        console.log(`  ${colors.muted('Name:')}   ${result.project.name}`);
        console.log(`  ${colors.muted('Prefix:')} ${result.project.identifierPrefix}`);
        console.log(`  ${colors.muted('Slug:')}   ${result.project.slug}`);
        if (repositoryPath) console.log(`  ${colors.muted('Repo:')}   ${repositoryPath}`);
        messages.newline();
      } catch (error) {
        if (
          error instanceof Error &&
          (error.message.includes('force closed') || error.message.includes('User force closed'))
        ) {
          messages.info('Cancelled');
          return;
        }
        const err = error instanceof Error ? error : new Error(String(error));
        messages.error('Failed to create project', err);
        process.exitCode = 1;
      }
    });
}
