import { execFile as cpExecFile, type ChildProcess } from 'node:child_process';
import type { IBrowserOpener } from '../../application/ports/output/services/i-browser-opener.js';

export interface BrowserOpenerDeps {
  platform: NodeJS.Platform;
  execFile: (
    cmd: string,
    args: readonly string[],
    callback: (error: Error | null) => void
  ) => ChildProcess;
  warn: (msg: string) => void;
  isTTY: boolean;
}

const defaultDeps: BrowserOpenerDeps = {
  platform: process.platform,
  execFile: cpExecFile as unknown as BrowserOpenerDeps['execFile'],
  // eslint-disable-next-line no-console
  warn: (msg) => console.warn(msg),
  isTTY: !!process.stdout.isTTY,
};

const PLATFORM_COMMANDS: Record<string, { cmd: string; args: (url: string) => string[] }> = {
  darwin: { cmd: 'open', args: (url) => [url] },
  linux: { cmd: 'xdg-open', args: (url) => [url] },
  win32: { cmd: 'cmd', args: (url) => ['/c', 'start', '', url] },
};

export class BrowserOpenerService implements IBrowserOpener {
  private deps: BrowserOpenerDeps;

  constructor(deps: Partial<BrowserOpenerDeps> = {}) {
    this.deps = { ...defaultDeps, ...deps };
  }

  open(url: string): void {
    // Skip browser opening in non-interactive environments (tests, CI, piped output).
    if (!this.deps.isTTY) return;

    const entry = PLATFORM_COMMANDS[this.deps.platform];
    if (!entry) return;

    const child = this.deps.execFile(entry.cmd, entry.args(url), (error) => {
      if (error) {
        this.deps.warn(`Failed to open browser: ${error.message}`);
      }
    });
    child.unref();
  }
}
