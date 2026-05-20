/**
 * stop Command
 *
 * Stops the running Shep web UI daemon.
 * Stop logic is implemented in the shared stopDaemon() helper.
 *
 * Usage: shep stop
 */

import { Command } from 'commander';
import { container } from '@/infrastructure/di/container.js';
import type { IDaemonService } from '@/application/ports/output/services/daemon-service.interface.js';
import { messages } from '../ui/index.js';
import { stopDaemon } from './daemon/stop-daemon.js';
import { getCliI18n } from '../i18n.js';

/**
 * Create the stop command.
 */
export function createStopCommand(): Command {
  const t = getCliI18n().t;
  return new Command('stop')
    .description(t('cli:commands.stop.description'))
    .addHelpText(
      'after',
      `
Examples:
  $ shep stop          Stop the running Shep daemon
  $ shep status        Check daemon state before stopping
  $ shep restart       Restart the daemon after stopping`
    )
    .action(async () => {
      const daemonService = container.resolve<IDaemonService>('IDaemonService');

      const state = await daemonService.read();

      // Print a user-facing message when no daemon state is recorded at all.
      // The alive-but-stale case (state exists, PID dead) is handled silently by stopDaemon.
      if (!state) {
        messages.info(t('cli:commands.stop.noDaemonRunning'));
      }

      await stopDaemon(daemonService);
    });
}
