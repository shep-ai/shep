/**
 * restart Command
 *
 * Gracefully restarts the Shep web UI daemon. If the daemon is not running,
 * starts it instead. Accepts an optional --port flag (parity with shep start).
 *
 * Usage: shep restart [--port <number>]
 */

import { Command, InvalidArgumentError } from 'commander';
import { container } from '@/infrastructure/di/container.js';
import type { IDaemonService } from '@/application/ports/output/services/daemon-service.interface.js';
import { messages } from '../ui/index.js';
import { stopDaemon } from './daemon/stop-daemon.js';
import { startDaemon } from './daemon/start-daemon.js';
import { getCliI18n } from '../i18n.js';
import { refuseHostShutdownFromAgent } from '@/domain/shared/agent-run-environment.js';
import { reportAgentRunRefusal } from './agent-run-guard.js';

function parsePort(value: string): number {
  const port = parseInt(value, 10);
  if (isNaN(port) || port < 1024 || port > 65535) {
    throw new InvalidArgumentError(getCliI18n().t('cli:commands.restart.portValidation'));
  }
  return port;
}

/**
 * Create the restart command.
 */
export function createRestartCommand(): Command {
  const t = getCliI18n().t;
  return new Command('restart')
    .description(t('cli:commands.restart.description'))
    .option('-p, --port <number>', t('cli:commands.restart.portOption'), parsePort)
    .option('--force', t('cli:ui.agentGuard.forceOption'))
    .addHelpText(
      'after',
      `
Examples:
  $ shep restart               Restart (or start) on default port
  $ shep restart --port 8080   Restart on custom port`
    )
    .action(async (options: { port?: number; force?: boolean }) => {
      if (reportAgentRunRefusal(refuseHostShutdownFromAgent(process.env, options.force === true))) {
        return;
      }
      const daemonService = container.resolve<IDaemonService>('IDaemonService');

      const state = await daemonService.read();
      const isRunning = state !== null && daemonService.isAlive(state.pid);

      if (isRunning) {
        // Daemon is running — stop it then start it, preserving the port unless overridden
        await stopDaemon(daemonService);
        await startDaemon({ port: options.port ?? state!.port });
      } else {
        // Daemon is not running — start it directly
        messages.info(t('cli:commands.restart.daemonNotRunning'));
        await startDaemon({ port: options.port });
      }
    });
}
