import { Command } from 'commander';
import { container } from '@/infrastructure/di/container.js';
import type { ICoastsService } from '@/application/ports/output/services/coasts-service.interface.js';
import { messages, spinner } from '../../ui/index.js';

interface InitOptions {
  force?: boolean;
}

export function createInitCommand(): Command {
  return new Command('init')
    .description('Generate a Coastfile for the current repository')
    .option('-f, --force', 'Overwrite existing Coastfile without prompting')
    .action(async (options: InitOptions) => {
      const workDir = process.cwd();

      try {
        const coastsService = container.resolve<ICoastsService>('ICoastsService');

        // Check if Coastfile already exists
        const exists = await coastsService.hasCoastfile(workDir);
        if (exists && !options.force) {
          messages.warning('Coastfile already exists. Use --force to regenerate.');
          return;
        }

        // Check prerequisites
        const prereqs = await coastsService.checkPrerequisites(workDir);
        if (!prereqs.allMet) {
          for (const msg of prereqs.missingMessages) {
            messages.error(msg);
          }
          process.exitCode = 1;
          return;
        }

        // Generate Coastfile
        const coastfilePath = await spinner('Generating Coastfile via AI agent...', () =>
          coastsService.generateCoastfile(workDir)
        );
        messages.success(`Coastfile generated at ${coastfilePath}`);

        // Build container
        await spinner('Building coast container...', () => coastsService.build(workDir));
        messages.success('Coast container built successfully.');
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        messages.error('Failed to initialize Coasts', err);
        process.exitCode = 1;
      }
    });
}
