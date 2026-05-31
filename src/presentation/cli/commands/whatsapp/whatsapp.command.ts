/**
 * `shep whatsapp` command group (spec 101).
 *
 * Thin presentation over the WhatsApp integration. `status` surfaces the
 * persisted configuration (adapter, linked number, authorized senders, flag
 * state) so a user can confirm their setup from the terminal. Interactive
 * linking (QR / pairing) is driven from the web Settings UI where the QR can be
 * rendered; this command points there.
 */

import { Command } from 'commander';
import { container } from '@/infrastructure/di/container.js';
import type { ISettingsRepository } from '@/application/ports/output/repositories/settings.repository.interface.js';
import { colors, fmt, messages } from '../../ui/index.js';

function onOff(value: boolean | undefined): string {
  return value ? colors.success('on') : colors.muted('off');
}

export function createWhatsappCommand(): Command {
  const command = new Command('whatsapp').description(
    'WhatsApp task dispatch integration (spec 101)'
  );

  command
    .command('status')
    .description('Show the WhatsApp integration configuration')
    .action(async () => {
      const settingsRepo = container.resolve<ISettingsRepository>('ISettingsRepository');
      const settings = await settingsRepo.load();
      const flagOn = settings?.featureFlags?.whatsappDispatch ?? false;
      const wa = settings?.whatsapp;

      messages.info(`Feature flag (whatsappDispatch): ${onOff(flagOn)}`);
      messages.info(`Integration enabled: ${onOff(wa?.enabled)}`);
      messages.info(`Adapter: ${fmt.code(wa?.adapter ?? 'baileys')}`);
      messages.info(
        `Linked number: ${wa?.linkedNumber ? fmt.code(wa.linkedNumber) : colors.muted('not linked')}`
      );
      messages.info(`Authorized senders: ${fmt.code(String(wa?.allowedNumbers?.length ?? 0))}`);
      messages.info(`Last known status: ${fmt.code(wa?.status ?? 'disconnected')}`);
      messages.newline();

      if (!flagOn || !wa?.enabled) {
        messages.info(
          'Enable the WhatsApp feature flag and integration in Settings → WhatsApp, then link your number from the web UI.'
        );
      } else {
        messages.info('Link or re-link your number from the web UI: Settings → WhatsApp.');
      }
    });

  return command;
}
