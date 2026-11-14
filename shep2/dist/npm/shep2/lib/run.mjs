// Runs the native binary as if it had been started directly: same stdio, same arguments,
// same exit status, signals passed on.

import process from 'node:process';
import { setTimeout } from 'node:timers';
import { spawn } from 'node:child_process';
import { constants } from 'node:os';

// A terminal sends these to the whole foreground process group, so the binary gets them
// already. The launcher swallows its copy and waits for the binary to decide what to do, so
// a terminal UI is never interrupted twice for one Ctrl-C.
const TERMINAL_SIGNALS = ['SIGINT', 'SIGQUIT'];

// These usually reach the launcher's pid alone (`kill`, a process manager, a parent going
// away), so they are passed on.
const FORWARDED_SIGNALS = ['SIGTERM', 'SIGHUP'];

// If re-raising a signal does not end the process (Node ignores SIGPIPE, for one), exit with
// the shell's code for it after this long.
const RERAISE_FALLBACK_MS = 200;
const SIGNAL_EXIT_BASE = 128;

export function run(binary, args) {
  const child = spawn(binary, args, { stdio: 'inherit' });

  const listeners = [
    ...TERMINAL_SIGNALS.map((signal) => [
      signal,
      () => {
        // ignored: the binary got the same signal from the terminal
      },
    ]),
    ...FORWARDED_SIGNALS.map((signal) => [signal, () => child.kill(signal)]),
  ];
  for (const [signal, listener] of listeners) {
    process.on(signal, listener);
  }
  const stopListening = () => {
    for (const [signal, listener] of listeners) {
      process.off(signal, listener);
    }
  };

  child.on('error', (err) => {
    stopListening();
    process.stderr.write(`shep: could not start ${binary}: ${err.message}\n`);
    process.exit(1);
  });

  child.on('exit', (code, signal) => {
    stopListening();
    if (signal) {
      setTimeout(
        () => process.exit(SIGNAL_EXIT_BASE + (constants.signals[signal] ?? 0)),
        RERAISE_FALLBACK_MS
      );
      process.kill(process.pid, signal);
      return;
    }
    process.exit(code ?? 1);
  });
}
