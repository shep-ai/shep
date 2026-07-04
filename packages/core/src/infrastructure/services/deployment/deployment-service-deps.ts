/**
 * Injectable process-level dependencies for DeploymentService.
 *
 * Kept in a separate module so the service itself stays free of direct
 * process-control primitives (execFileSync et al.) and unit tests can inject
 * fully-mocked implementations.
 */

import { spawn, execFileSync } from 'node:child_process';
import { detectDevScript } from './detect-dev-script.js';
import { IS_WINDOWS } from '../../platform.js';

export interface DeploymentServiceDeps {
  spawn: typeof spawn;
  detectDevScript: typeof detectDevScript;
  kill: (pid: number, signal: NodeJS.Signals | string) => void;
  isAlive: (pid: number) => boolean;
}

// On Unix we use process.kill(-pid) to send signals to the process GROUP
// (detached: true puts the child in its own group via setsid()).
// On Windows, negative PIDs are not supported — use taskkill /T for tree kill.
export const defaultDeploymentServiceDeps: DeploymentServiceDeps = {
  spawn,
  detectDevScript,
  kill: (pid, signal) => {
    if (IS_WINDOWS) {
      // On Windows, negative PIDs are not supported. Use taskkill /T to
      // kill the entire process tree (shell + child dev server).
      try {
        execFileSync('taskkill', ['/F', '/T', '/PID', String(pid)], {
          stdio: 'ignore',
          windowsHide: true,
        });
      } catch {
        // Process already dead
      }
      return;
    }
    try {
      // Kill the entire process group (negative PID) — safe because
      // detached: true puts the child in its own group via setsid().
      process.kill(-pid, signal as NodeJS.Signals);
    } catch {
      // Fallback: kill just the process itself
      try {
        process.kill(pid, signal as NodeJS.Signals);
      } catch {
        // Process already dead
      }
    }
  },
  isAlive: (pid: number) => {
    try {
      process.kill(pid, 0);
      return true;
    } catch {
      return false;
    }
  },
};
