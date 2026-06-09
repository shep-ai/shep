/**
 * Messaging Configuration Command
 *
 * Configures external messaging remote control via Telegram or WhatsApp
 * through the Commands.com Gateway.
 *
 * Usage:
 *   shep settings messaging             # Interactive setup wizard
 *   shep settings messaging status      # Show connection status
 *   shep settings messaging disconnect  # Disconnect messaging
 */

import { Command } from 'commander';
import { select, input, confirm } from '@inquirer/prompts';
import { container } from '@/infrastructure/di/container.js';
import { BeginMessagingPairingUseCase } from '@/application/use-cases/messaging/begin-pairing.use-case.js';
import { ConfirmMessagingPairingUseCase } from '@/application/use-cases/messaging/confirm-pairing.use-case.js';
import { DisconnectMessagingUseCase } from '@/application/use-cases/messaging/disconnect-messaging.use-case.js';
import { UpdateSettingsUseCase } from '@/application/use-cases/settings/update-settings.use-case.js';
import {
  getSettings,
  resetSettings,
  initializeSettings,
} from '@/infrastructure/services/settings.service.js';
import { LoadSettingsUseCase } from '@/application/use-cases/settings/load-settings.use-case.js';
import { MessagingPlatform } from '@/domain/generated/output.js';
import { messages } from '../../ui/index.js';
import { shepTheme } from '../../../tui/themes/shep.theme.js';

/**
 * Create the messaging configuration command.
 */
export function createMessagingCommand(): Command {
  const cmd = new Command('messaging')
    .description('Configure messaging remote control (Telegram/WhatsApp)')
    .addHelpText(
      'after',
      `
Examples:
  $ shep settings messaging             Interactive setup wizard
  $ shep settings messaging status      Show connection status
  $ shep settings messaging disconnect  Disconnect messaging`
    )
    .action(async () => {
      try {
        await runMessagingWizard();
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));

        if (err.message.includes('force closed') || err.message.includes('User force closed')) {
          messages.info('Messaging setup cancelled.');
          return;
        }

        messages.error('Failed to configure messaging', err);
        process.exitCode = 1;
      }
    });

  cmd
    .command('status')
    .description('Show messaging connection status')
    .action(() => {
      const settings = getSettings();
      const mc = settings.messaging;

      if (!mc?.enabled) {
        messages.info('Messaging remote control is not configured.');
        return;
      }

      console.log(`\nMessaging Remote Control`);
      console.log(`  Gateway: ${mc.gatewayUrl ?? 'not set'}`);
      console.log(`  Enabled: ${mc.enabled}`);

      if (mc.telegram) {
        console.log(
          `  Telegram: ${mc.telegram.enabled ? 'enabled' : 'disabled'} (${mc.telegram.paired ? 'paired' : 'not paired'})`
        );
      }

      if (mc.whatsapp) {
        console.log(
          `  WhatsApp: ${mc.whatsapp.enabled ? 'enabled' : 'disabled'} (${mc.whatsapp.paired ? 'paired' : 'not paired'})`
        );
      }

      console.log('');
    });

  cmd
    .command('disconnect')
    .description('Disconnect all messaging platforms')
    .action(async () => {
      try {
        const useCase = container.resolve(DisconnectMessagingUseCase);
        await useCase.execute();
        await refreshSettingsSingleton();
        messages.success('Messaging remote control disconnected.');
      } catch (error) {
        messages.error(
          'Failed to disconnect messaging',
          error instanceof Error ? error : new Error(String(error))
        );
        process.exitCode = 1;
      }
    });

  return cmd;
}

async function refreshSettingsSingleton(): Promise<void> {
  const loadUseCase = container.resolve(LoadSettingsUseCase);
  const fresh = await loadUseCase.execute();
  resetSettings();
  initializeSettings(fresh);
}

async function runMessagingWizard(): Promise<void> {
  const settings = getSettings();

  const platformChoice = await select<string>({
    message: 'Which platform would you like to connect?',
    choices: [
      { name: 'Telegram', value: 'telegram' },
      { name: 'WhatsApp', value: 'whatsapp' },
      { name: 'Disconnect all', value: 'disconnect' },
    ],
    theme: shepTheme,
  });

  if (platformChoice === 'disconnect') {
    const disconnectUseCase = container.resolve(DisconnectMessagingUseCase);
    await disconnectUseCase.execute();
    await refreshSettingsSingleton();
    messages.success('Messaging remote control disconnected.');
    return;
  }

  const platform =
    platformChoice === 'telegram' ? MessagingPlatform.Telegram : MessagingPlatform.WhatsApp;
  const platformLabel = platformChoice === 'telegram' ? 'Telegram' : 'WhatsApp';

  // Get Gateway URL
  const gatewayUrl = await input({
    message: 'Enter your Gateway URL:',
    default: settings.messaging?.gatewayUrl ?? '',
    validate: (value: string) => {
      if (!value.trim()) return 'Gateway URL is required';
      try {
        new URL(value);
        return true;
      } catch {
        return 'Please enter a valid URL (e.g., https://my-gateway.railway.app)';
      }
    },
    theme: shepTheme,
  });

  // Begin pairing — generates a one-time code and persists pending state.
  const beginUseCase = container.resolve(BeginMessagingPairingUseCase);
  const session = await beginUseCase.execute({ platform, gatewayUrl });
  await refreshSettingsSingleton();

  messages.info(`${platformLabel} pairing initiated.`);
  console.log('');
  console.log(`  Pairing code: ${session.code}`);
  console.log(`  Expires at:   ${new Date(session.expiresAt).toLocaleString()}`);
  console.log('');
  console.log(`  Webhook URL (${platformLabel}):`);
  console.log(`    ${session.publicUrl}`);
  console.log('');
  console.log('  Next steps:');
  console.log(`    1. Point your ${platformLabel} bot webhook at the URL above`);
  console.log(
    `       (Telegram: curl -X POST https://api.telegram.org/bot<TOKEN>/setWebhook -d url=...)`
  );
  console.log(`    2. Send: /pair ${session.code}`);
  console.log(`    3. Return here and enter the chat ID the bot replies with`);
  console.log('');

  const shouldConfirm = await confirm({
    message: 'Confirm pairing now?',
    default: true,
    theme: shepTheme,
  });

  if (!shouldConfirm) {
    messages.info('You can confirm pairing later by re-running `shep settings messaging`.');
    return;
  }

  const chatId = await input({
    message: 'Chat ID the bot replied with:',
    validate: (value: string) => (value.trim() ? true : 'Chat ID is required'),
    theme: shepTheme,
  });

  const confirmUseCase = container.resolve(ConfirmMessagingPairingUseCase);
  await confirmUseCase.execute({ platform, chatId });
  await refreshSettingsSingleton();

  // Collect the bot API token so the daemon can reply to the user.
  const botToken = await input({
    message: `${platformLabel} bot API token (leave blank to use $SHEP_TELEGRAM_BOT_TOKEN):`,
    default: '',
    theme: shepTheme,
  });

  if (botToken.trim()) {
    const current = getSettings();
    const key: 'telegram' | 'whatsapp' =
      platform === MessagingPlatform.Telegram ? 'telegram' : 'whatsapp';
    const existingPlatform = current.messaging?.[key];
    if (existingPlatform && current.messaging) {
      current.messaging = {
        ...current.messaging,
        [key]: { ...existingPlatform, botToken: botToken.trim() },
      };
      const updateUseCase = container.resolve(UpdateSettingsUseCase);
      await updateUseCase.execute(current);
      await refreshSettingsSingleton();
    }
  }

  messages.success(`${platformLabel} messaging paired.`);
  messages.info('Restart the Shep daemon (`shep _serve`) to activate messaging.');
}
