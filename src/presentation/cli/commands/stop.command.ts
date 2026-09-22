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
import { refuseHostShutdownFromAgent } from '@/domain/shared/agent-run-environment.js';
import { reportAgentRunRefusal } from './agent-run-guard.js';

/**
 * Create the stop command.
 */
export function createStopCommand(): Command {
  const t = getCliI18n().t;
  return new Command('stop')
    .description(t('cli:commands.stop.description'))
    .option('--force', t('cli:ui.agentGuard.forceOption'))
    .addHelpText(
      'after',
      `
Examples:
  $ shep stop          Stop the running Shep daemon
  $ shep status        Check daemon state before stopping
  $ shep restart       Restart the daemon after stopping`
    )
    .action(async (options: { force?: boolean }) => {
      if (reportAgentRunRefusal(refuseHostShutdownFromAgent(process.env, options.force === true))) {
        return;
      }
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
