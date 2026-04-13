import { Command } from 'commander';
import { container } from '@/infrastructure/di/container.js';
import { GetPmProjectUseCase } from '@/application/use-cases/pm-projects/get-pm-project.use-case.js';
import { ExportWorkItemsCsvUseCase } from '@/application/use-cases/import-export/export-work-items-csv.use-case.js';
import type { ExportColumn } from '@/application/use-cases/import-export/export-work-items-csv.use-case.js';
import { messages } from '../../ui/index.js';

const DEFAULT_COLUMNS: ExportColumn[] = [
  'identifier',
  'title',
  'state',
  'priority',
  'estimate',
  'dueDate',
];

export function createExportCommand(): Command {
  return new Command('export')
    .description('Export work items as CSV')
    .argument('<project>', 'Project slug or identifier prefix')
    .option(
      '-c, --columns <cols>',
      'Comma-separated columns (identifier,title,state,priority,labels,estimate,dueDate,startDate,description)',
      DEFAULT_COLUMNS.join(',')
    )
    .option('-o, --output <file>', 'Write to file instead of stdout')
    .action(async (projectSlug: string, opts: { columns: string; output?: string }) => {
      try {
        const getProject = container.resolve(GetPmProjectUseCase);
        const projectResult = await getProject.execute(projectSlug);

        if (!projectResult.ok) {
          messages.error(projectResult.error);
          process.exitCode = 1;
          return;
        }

        const columns = opts.columns.split(',').map((c) => c.trim()) as ExportColumn[];

        const exportUseCase = container.resolve(ExportWorkItemsCsvUseCase);
        const result = await exportUseCase.execute({
          projectId: projectResult.project.id,
          columns,
        });

        if (!result.ok) {
          messages.error(result.error);
          process.exitCode = 1;
          return;
        }

        if (opts.output) {
          const { writeFileSync } = await import('node:fs');
          writeFileSync(opts.output, result.csv, 'utf-8');
          messages.success(`Exported ${result.itemCount} items to ${opts.output}`);
        } else {
          console.log(result.csv);
          messages.info(`${result.itemCount} items exported.`);
        }
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        messages.error('Failed to export work items', err);
        process.exitCode = 1;
      }
    });
}
