/**
 * shep telemetry — usage metrics controls (spec 133).
 *
 *   shep telemetry on|off           turn usage metrics on or off (off deletes queued events)
 *   shep telemetry identity on|off  include or leave out the identity fields
 *   shep telemetry contact on|off   allow or refuse contact from the Shep team on GitHub
 *   shep telemetry status           what is on, what is queued, where it goes
 *   shep telemetry show             the exact body the next send would post
 */

import { Command } from 'commander';
import { container } from '@/infrastructure/di/container.js';
import type { TelemetryDisabledReason } from '@/domain/generated/output.js';
import {
  SetTelemetryPreferencesUseCase,
  type TelemetryPreferencesInput,
} from '@/application/use-cases/telemetry/set-telemetry-preferences.use-case.js';
import { GetTelemetryStatusUseCase } from '@/application/use-cases/telemetry/get-telemetry-status.use-case.js';
import { PreviewTelemetryUseCase } from '@/application/use-cases/telemetry/preview-telemetry.use-case.js';
import { colors, messages } from '../../ui/index.js';
import { getCliI18n } from '../../i18n.js';

const KEY = 'cli:commands.telemetry';
const ON = 'on';
const OFF = 'off';
const JSON_INDENT = 2;

function t(key: string, options?: Record<string, unknown>): string {
  return getCliI18n().t(`${KEY}.${key}`, options);
}

function reasonText(reason: TelemetryDisabledReason | null): string {
  return reason ? t(`reasons.${reason}`) : '';
}

/** Parse "on"/"off" inside the action so a typo reports instead of exiting the process. */
function parseState(value: string): boolean | null {
  const normalized = value.trim().toLowerCase();
  if (normalized === ON) return true;
  if (normalized === OFF) return false;
  return null;
}

async function setPreferences(input: TelemetryPreferencesInput, confirmation: string) {
  try {
    await container.resolve(SetTelemetryPreferencesUseCase).execute(input);
    messages.success(confirmation);
    const status = await container.resolve(GetTelemetryStatusUseCase).execute();
    if (input.enabled === true && !status.enabled) {
      messages.warning(t('forcedOff', { reason: reasonText(status.reason) }));
    }
  } catch (error) {
    messages.error(t('failed'), error instanceof Error ? error : new Error(String(error)));
    process.exitCode = 1;
  }
}

function createToggleCommand(
  name: string,
  apply: (on: boolean) => TelemetryPreferencesInput
): Command {
  return new Command(name)
    .description(t(`${name}.description`))
    .argument('<state>', t('stateArgument'))
    .action(async (value: string) => {
      const on = parseState(value);
      if (on === null) {
        messages.error(t('invalidState', { value }));
        process.exitCode = 1;
        return;
      }
      await setPreferences(apply(on), t(`${name}.${on ? ON : OFF}`));
    });
}

function createStatusCommand(): Command {
  return new Command('status').description(t('status.description')).action(async () => {
    try {
      const status = await container.resolve(GetTelemetryStatusUseCase).execute();
      const rows: [string, string][] = [
        [
          t('status.metrics'),
          status.enabled
            ? colors.success(t('status.on'))
            : colors.warning(t('status.off', { reason: reasonText(status.reason) })),
        ],
        [t('status.identity'), t(status.includeIdentity ? 'status.included' : 'status.excluded')],
        [t('status.contact'), t(status.contactConsent ? 'status.yes' : 'status.no')],
        [t('status.installId'), status.installId ?? '—'],
        [t('status.queued'), String(status.queuedEvents)],
        [
          t('status.destination'),
          status.configured ? status.destination : colors.muted(t('status.notConfigured')),
        ],
      ];
      const width = Math.max(...rows.map(([label]) => label.length));
      for (const [label, value] of rows) {
        messages.log(`${label.padEnd(width)}  ${value}`);
      }
    } catch (error) {
      messages.error(t('failed'), error instanceof Error ? error : new Error(String(error)));
      process.exitCode = 1;
    }
  });
}

function createShowCommand(): Command {
  return new Command('show').description(t('show.description')).action(async () => {
    try {
      const preview = await container.resolve(PreviewTelemetryUseCase).execute();
      if (!preview.enabled) messages.warning(t('show.disabled'));
      if (!preview.configured) messages.info(t('show.notConfigured'));
      if (preview.queuedEvents === 0) {
        messages.info(t('show.empty'));
        return;
      }
      messages.info(
        t('show.header', { destination: preview.destination, queued: preview.queuedEvents })
      );
      messages.log(JSON.stringify(preview.body, null, JSON_INDENT));
    } catch (error) {
      messages.error(t('failed'), error instanceof Error ? error : new Error(String(error)));
      process.exitCode = 1;
    }
  });
}

export function createTelemetryCommand(): Command {
  return new Command('telemetry')
    .description(t('description'))
    .addCommand(
      new Command(ON)
        .description(t('on.description'))
        .action(() => setPreferences({ enabled: true }, t('on.done')))
    )
    .addCommand(
      new Command(OFF)
        .description(t('off.description'))
        .action(() => setPreferences({ enabled: false }, t('off.done')))
    )
    .addCommand(createToggleCommand('identity', (on) => ({ includeIdentity: on })))
    .addCommand(createToggleCommand('contact', (on) => ({ contactConsent: on })))
    .addCommand(createStatusCommand())
    .addCommand(createShowCommand());
}
