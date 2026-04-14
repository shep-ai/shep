'use server';

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';

/**
 * Open a local directory in the OS file manager (Finder / Explorer / Nautilus).
 * Fire-and-forget — we don't wait for the explorer to close.
 */
export async function openDirectory(dirPath: string): Promise<{ error?: string }> {
  if (!dirPath) return { error: 'No path provided' };

  // Normalise Windows backslashes for cross-platform safety.
  const normalized = dirPath.replace(/\\/g, '/');

  if (!existsSync(normalized)) {
    return { error: `Directory not found: ${normalized}` };
  }

  const cmd =
    process.platform === 'darwin'
      ? ['open', normalized]
      : process.platform === 'win32'
        ? ['explorer', normalized.replace(/\//g, '\\')]
        : ['xdg-open', normalized];

  spawn(cmd[0]!, cmd.slice(1), {
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
  }).unref();

  return {};
}
