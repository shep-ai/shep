/**
 * CLI telemetry wiring (spec 133).
 *
 * - Before each user command: print the one-time usage-metrics notice to
 *   stderr (stdout stays clean for piped output) and record `cli.command` with
 *   the command path only — never arguments or options.
 * - Crash handlers record `error.unhandled`.
 *
 * Telemetry must never change what a command does, so every call is guarded.
 */

import type { Command } from 'commander';
import { EOL } from 'node:os';
import { container } from '@/infrastructure/di/container.js';
import { TelemetryEvent } from '@/domain/generated/output.js';
import { RecordTelemetryEventUseCase } from '@/application/use-cases/telemetry/record-telemetry-event.use-case.js';
import { AcknowledgeTelemetryNoticeUseCase } from '@/application/use-cases/telemetry/acknowledge-telemetry-notice.use-case.js';
import { RecordUnhandledErrorUseCase } from '@/application/use-cases/telemetry/record-unhandled-error.use-case.js';
import { getCliI18n } from './i18n.js';

/** Hidden commands (`_serve`) start with this prefix and are not user activity. */
const INTERNAL_COMMAND_PREFIX = '_';
/** How the bare `shep` invocation (start the daemon) is reported. */
const DEFAULT_COMMAND = 'shep';
const NOTICE_KEY = 'cli:bootstrap.telemetryNotice';

/** Command names from the root's child down to `command`, joined by spaces. */
export function commandPath(command: Command): string {
  const names: string[] = [];
  for (let node: Command | null = command; node?.parent; node = node.parent) {
    names.unshift(node.name());
  }
  return names.join(' ');
}

function writeNotice(fields: readonly string[]): void {
  const t = getCliI18n().t.bind(getCliI18n());
  const lines = [
    '',
    t(`${NOTICE_KEY}.title`),
    t(`${NOTICE_KEY}.intro`),
    t(`${NOTICE_KEY}.fieldsHeading`),
    ...fields.map((field) => `  - ${t(`${NOTICE_KEY}.fields.${field}`)}`),
    t(`${NOTICE_KEY}.identityNote`),
    t(`${NOTICE_KEY}.optOut`),
    '',
  ];
  process.stderr.write(lines.join(EOL) + EOL);
}

async function showNoticeOnce(): Promise<void> {
  try {
    const notice = await container.resolve(AcknowledgeTelemetryNoticeUseCase).execute();
    if (notice.show) writeNotice(notice.fields);
  } catch {
    // The notice is retried on the next run.
  }
}

function recordCommand(path: string): void {
  try {
    container
      .resolve(RecordTelemetryEventUseCase)
      .execute(TelemetryEvent.CliCommand, { command: path || DEFAULT_COMMAND });
  } catch {
    // Telemetry must never break the command.
  }
}

export function registerTelemetryHooks(program: Command): void {
  program.hook('preAction', async (_root, actionCommand) => {
    const path = commandPath(actionCommand);
    if (path.startsWith(INTERNAL_COMMAND_PREFIX)) return;
    await showNoticeOnce();
    recordCommand(path);
  });
}

/** Record `error.unhandled` from a crash handler. Never throws. */
export function recordUnhandledError(error: unknown): void {
  try {
    container.resolve(RecordUnhandledErrorUseCase).execute(error);
  } catch {
    // The container may not be initialised yet.
  }
}
