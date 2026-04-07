/**
 * Port Conflict Detection
 *
 * Checks if the default port is in use (indicating a running CLI daemon)
 * before starting the web server. If a conflict is detected, shows a
 * dialog with options:
 * 1. Connect to existing — load the existing daemon's URL without starting
 *    a new server
 * 2. Start new — find the next available port and start a new server
 *
 * Uses the existing isPortAvailable() and findAvailablePort() from core.
 */

export interface PortResolution {
  port: number;
  startServer: boolean;
}

interface DialogOptions {
  type: string;
  title: string;
  message: string;
  detail: string;
  buttons: string[];
  defaultId: number;
}

/** Injectable dependencies for port conflict detection. */
export interface PortConflictDeps {
  defaultPort: number;
  isPortAvailable: (port: number) => Promise<boolean>;
  findAvailablePort: (startPort: number) => Promise<number>;
  showDialog: (options: DialogOptions) => Promise<number>;
  warn: (msg: string, error?: unknown) => void;
}

/**
 * Resolve the port to use for the web server.
 * If the default port is in use, prompt the user with a dialog.
 */
export async function resolvePort(deps: PortConflictDeps): Promise<PortResolution> {
  try {
    const available = await deps.isPortAvailable(deps.defaultPort);

    if (available) {
      return { port: deps.defaultPort, startServer: true };
    }

    // Port is in use — show conflict dialog
    const choice = await deps.showDialog({
      type: 'question',
      title: 'Shep Daemon Running',
      message: `Port ${deps.defaultPort} is already in use`,
      detail:
        'A shep daemon appears to be running. You can connect to the existing instance ' +
        'or start a new one on a different port.',
      buttons: ['Connect to Existing', 'Start New Instance'],
      defaultId: 0,
    });

    if (choice === 0) {
      // Connect to existing — don't start a new server
      return { port: deps.defaultPort, startServer: false };
    }

    // Start new — find next available port
    const newPort = await deps.findAvailablePort(deps.defaultPort + 1);
    return { port: newPort, startServer: true };
  } catch (error) {
    // On error, proceed optimistically with default port
    deps.warn('Port conflict check failed, proceeding with default port:', error);
    return { port: deps.defaultPort, startServer: true };
  }
}
