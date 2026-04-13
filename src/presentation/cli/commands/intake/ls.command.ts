import { Command } from 'commander';
import { container } from '@/infrastructure/di/container.js';
import { GetPmProjectUseCase } from '@/application/use-cases/pm-projects/get-pm-project.use-case.js';
import { ListIntakeItemsUseCase } from '@/application/use-cases/intake/list-intake-items.use-case.js';
import { colors, messages, renderListView } from '../../ui/index.js';

export function createLsCommand(): Command {
  return new Command('ls')
    .description('List intake items for a project')
    .argument('<project>', 'Project slug or identifier prefix')
    .option('-s, --status <status>', 'Filter by status (Pending, Accepted, Declined, Duplicate)')
    .action(async (projectSlug: string, opts: { status?: string }) => {
      try {
        const getProject = container.resolve(GetPmProjectUseCase);
        const result = await getProject.execute(projectSlug);

        if (!result.ok) {
          messages.error(result.error);
          process.exitCode = 1;
          return;
        }

        const listItems = container.resolve(ListIntakeItemsUseCase);
        const listResult = await listItems.execute({
          projectId: result.project.id,
          status: opts.status,
        });

        const rows = listResult.items.map((item) => [
          colors.muted(item.id.substring(0, 8)),
          item.title,
          item.status,
          item.source,
          item.suggestedPriority ?? colors.muted('—'),
        ]);

        renderListView({
          title: `${result.project.name} — Intake Items`,
          columns: [
            { label: 'ID', width: 10 },
            { label: 'Title', width: 30 },
            { label: 'Status', width: 10 },
            { label: 'Source', width: 10 },
            { label: 'Priority', width: 10 },
          ],
          rows,
          emptyMessage: 'No intake items found.',
        });
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        messages.error('Failed to list intake items', err);
        process.exitCode = 1;
      }
    });
}
