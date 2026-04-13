import { Command } from 'commander';
import { container } from '@/infrastructure/di/container.js';
import { ListNotificationsUseCase } from '@/application/use-cases/notifications/list-notifications.use-case.js';
import { colors, messages, renderListView } from '../../ui/index.js';

export function createLsCommand(): Command {
  return new Command('ls')
    .description('List notifications')
    .argument('<recipient>', 'Recipient user ID')
    .option('-p, --project <projectId>', 'Filter by project ID')
    .option('--unread', 'Show only unread notifications')
    .action(async (recipientId: string, opts: { project?: string; unread?: boolean }) => {
      try {
        const useCase = container.resolve(ListNotificationsUseCase);
        const result = await useCase.execute({
          recipientId,
          projectId: opts.project,
          unreadOnly: opts.unread,
        });

        const rows = result.notifications.map((n) => [
          colors.muted(n.id.substring(0, 8)),
          n.title,
          n.type,
          n.isRead ? colors.muted('read') : 'unread',
          n.createdAt ? new Date(n.createdAt).toLocaleDateString() : colors.muted('—'),
        ]);

        renderListView({
          title: `Notifications${result.unreadCount > 0 ? ` (${result.unreadCount} unread)` : ''}`,
          columns: [
            { label: 'ID', width: 10 },
            { label: 'Title', width: 30 },
            { label: 'Type', width: 14 },
            { label: 'Status', width: 8 },
            { label: 'Date', width: 12 },
          ],
          rows,
          emptyMessage: 'No notifications found.',
        });
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        messages.error('Failed to list notifications', err);
        process.exitCode = 1;
      }
    });
}
