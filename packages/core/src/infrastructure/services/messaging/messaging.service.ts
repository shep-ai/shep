/**
 * Messaging Service
 *
 * Core orchestrator for the external messaging remote control feature.
 * Wires together:
 *   - Commands.com Gateway tunnel (inbound webhook delivery)
 *   - Telegram Bot API client (outbound replies + notifications)
 *   - Command executor (parses slash commands, runs use cases)
 *   - Notification emitter (debounced forwarding from the local event bus)
 *   - Chat relay (interactive agent ↔ messenger bridge)
 *   - Pairing auto-confirm (matches /pair <code> against pending codes)
 *
 * Lifecycle:
 *   1. `isConfigured()` checks settings for required fields.
 *   2. `start()` opens the tunnel and subscribes to the notification bus.
 *   3. Inbound `tunnel.request` frames are parsed as Telegram Update objects
 *      and dispatched to either the pair confirm flow or the command executor.
 *   4. `stop()` tears everything down.
 */

import type { IMessagingService } from '../../../application/ports/output/services/messaging-service.interface.js';
import type {
  MessagingCommand,
  MessagingNotification,
  MessagingConfig,
} from '../../../domain/generated/output.js';
import {
  MessagingPlatform,
  MessagingFrameType,
  MessagingCommandType,
} from '../../../domain/generated/output.js';
import { MessagingTunnelAdapter } from './messaging-tunnel.adapter.js';
import type { DecodedTunnelRequest, TunnelRequestResponse } from './tunnel-protocol.js';
import { MessagingCommandExecutor } from './command-executor.js';
import { MessagingNotificationEmitter } from './notification-emitter.js';
import { MessagingChatRelay } from './chat-relay.js';
import { TelegramMessageSender } from './telegram-message-sender.js';
import { parseTelegramUpdate, parsePairCommand } from './telegram-webhook.parser.js';
import type { NotificationBus } from '../notifications/notification-bus.js';
import type { IFeatureRepository } from '../../../application/ports/output/repositories/feature-repository.interface.js';
import type { ListFeaturesUseCase } from '../../../application/use-cases/features/list-features.use-case.js';
import type { ShowFeatureUseCase } from '../../../application/use-cases/features/show-feature.use-case.js';
import type { CreateFeatureUseCase } from '../../../application/use-cases/features/create/create-feature.use-case.js';
import type { ApproveAgentRunUseCase } from '../../../application/use-cases/agents/approve-agent-run.use-case.js';
import type { RejectAgentRunUseCase } from '../../../application/use-cases/agents/reject-agent-run.use-case.js';
import type { StopAgentRunUseCase } from '../../../application/use-cases/agents/stop-agent-run.use-case.js';
import type { ResumeFeatureUseCase } from '../../../application/use-cases/features/resume-feature.use-case.js';
import type { ListRepositoriesUseCase } from '../../../application/use-cases/repositories/list-repositories.use-case.js';
import type { ConfirmMessagingPairingUseCase } from '../../../application/use-cases/messaging/confirm-pairing.use-case.js';
import type { ITelegramClient } from '../../../application/ports/output/services/telegram-client.interface.js';
import type { IInteractiveSessionService } from '../../../application/ports/output/services/interactive-session-service.interface.js';
import { parseWhatsAppUpdate } from './whatsapp-webhook.parser.js';

interface MessagingServiceDeps {
  config: MessagingConfig;
  accessToken: string;
  telegramClient: ITelegramClient;
  /** Bot token the sender will use to reply to Telegram users. */
  telegramBotToken?: string;
  notificationBus: NotificationBus;
  featureRepo: IFeatureRepository;
  createFeature: CreateFeatureUseCase;
  approveAgentRun: ApproveAgentRunUseCase;
  rejectAgentRun: RejectAgentRunUseCase;
  stopAgentRun: StopAgentRunUseCase;
  resumeFeature: ResumeFeatureUseCase;
  listFeatures: ListFeaturesUseCase;
  showFeature: ShowFeatureUseCase;
  listRepositories: ListRepositoriesUseCase;
  confirmPairing: ConfirmMessagingPairingUseCase;
  interactiveSessionService: IInteractiveSessionService;
}

interface SlashCommand {
  command: MessagingCommandType;
  featureId?: string;
  args?: string;
}

const COMMAND_REGEX =
  /^\/(new|approve|reject|stop|resume|status|list|chat|end|mute|unmute|help)(?:@\w+)?(?:\s+(\S+))?(?:\s+(.+))?$/i;

const COMMANDS_TAKING_FEATURE_ID: readonly MessagingCommandType[] = [
  MessagingCommandType.Approve,
  MessagingCommandType.Reject,
  MessagingCommandType.Stop,
  MessagingCommandType.Resume,
  MessagingCommandType.Status,
  MessagingCommandType.Chat,
];

function parseSlashCommand(text: string): SlashCommand | null {
  const match = text.trim().match(COMMAND_REGEX);
  if (!match) return null;
  const command = match[1].toLowerCase() as MessagingCommandType;
  const second = match[2];
  const rest = match[3];

  if (COMMANDS_TAKING_FEATURE_ID.includes(command) && second) {
    return { command, featureId: second, args: rest };
  }

  const args = [second, rest].filter(Boolean).join(' ');
  return { command, args: args || undefined };
}

export class MessagingService implements IMessagingService {
  private tunnelAdapter: MessagingTunnelAdapter | null = null;
  private commandExecutor: MessagingCommandExecutor | null = null;
  private notificationEmitter: MessagingNotificationEmitter | null = null;
  private chatRelay: MessagingChatRelay | null = null;
  private sender: TelegramMessageSender | null = null;
  private started = false;

  constructor(private readonly deps: MessagingServiceDeps) {}

  isConfigured(): boolean {
    const { config } = this.deps;
    if (!config.enabled || !config.gatewayUrl || !config.deviceId) return false;

    // The tunnel must start as soon as a route exists — not only after the
    // user is fully paired. The auto-confirm flow requires this: the daemon
    // needs to be receiving tunnel.request frames in order to see the
    // inbound `/pair <code>` message from the user's first DM and call
    // ConfirmMessagingPairingUseCase. If we gated on `paired && chatId`
    // the user could never complete pairing without a manual chatId entry
    // in the UI.
    const telegramReady = !!config.telegram?.routeId;
    const whatsappReady = !!config.whatsapp?.routeId;
    return telegramReady || whatsappReady;
  }

  isConnected(): boolean {
    return this.tunnelAdapter?.isConnected() ?? false;
  }

  async start(): Promise<void> {
    if (this.started || !this.isConfigured()) return;

    const { config, accessToken, telegramClient, notificationBus, featureRepo } = this.deps;

    const routeIds = this.collectRouteIds();
    this.tunnelAdapter = new MessagingTunnelAdapter({
      gatewayUrl: config.gatewayUrl!,
      accessToken,
      deviceId: config.deviceId!,
      routeIds,
    });

    this.sender = new TelegramMessageSender(telegramClient, () => {
      const chatId = this.deps.config.telegram?.chatId;
      const botToken = this.deps.telegramBotToken;
      if (!chatId || !botToken) return null;
      return { chatId, botToken };
    });

    this.commandExecutor = new MessagingCommandExecutor(
      featureRepo,
      this.deps.createFeature,
      this.deps.approveAgentRun,
      this.deps.rejectAgentRun,
      this.deps.stopAgentRun,
      this.deps.resumeFeature,
      this.deps.listFeatures,
      this.deps.showFeature,
      this.deps.listRepositories
    );

    this.notificationEmitter = new MessagingNotificationEmitter(
      this.sender,
      notificationBus,
      config.debounceMs ?? 5_000
    );

    this.chatRelay = new MessagingChatRelay(this.sender, config.chatBufferMs ?? 3_000);

    this.tunnelAdapter.onRequest((req) => this.handleTunnelRequest(req));

    try {
      await this.tunnelAdapter.connect();
    } catch {
      // Connection failure is non-fatal — the adapter reconnects automatically.
    }

    this.notificationEmitter.start();
    this.started = true;
  }

  async stop(): Promise<void> {
    if (!this.started) return;

    this.notificationEmitter?.stop();
    this.chatRelay?.stop();
    await this.tunnelAdapter?.disconnect();

    this.tunnelAdapter = null;
    this.commandExecutor = null;
    this.notificationEmitter = null;
    this.chatRelay = null;
    this.sender = null;
    this.started = false;
  }

  async sendNotification(notification: MessagingNotification): Promise<void> {
    await this.sender?.send(notification);
  }

  private collectRouteIds(): string[] {
    const out: string[] = [];
    const { config } = this.deps;
    if (config.telegram?.routeId) out.push(config.telegram.routeId);
    if (config.whatsapp?.routeId) out.push(config.whatsapp.routeId);
    return out;
  }

  private async handleTunnelRequest(req: DecodedTunnelRequest): Promise<TunnelRequestResponse> {
    // Per-route → platform resolution.
    const platform = this.platformForRoute(req.routeId);
    if (!platform) {
      return { status: 404 };
    }

    const parsed =
      platform === MessagingPlatform.Telegram
        ? parseTelegramUpdate(req.body)
        : parseWhatsAppUpdate(req.body);
    if (!parsed) {
      return { status: 200 };
    }

    // 1. Handle /pair <code> auto-confirmation before anything else.
    const pair = parsePairCommand(parsed.text);
    if (pair) {
      await this.handlePairConfirm(platform, parsed.chatId, pair.code);
      return { status: 200 };
    }

    // 2. Dispatch slash commands via the command executor. /chat and /end
    //    are handled specially because they manipulate the chat relay.
    const slash = parseSlashCommand(parsed.text);
    if (slash) {
      if (slash.command === MessagingCommandType.Chat) {
        await this.handleChatStart(platform, parsed.chatId, slash.featureId);
        return { status: 200 };
      }
      if (slash.command === MessagingCommandType.End) {
        await this.handleChatEnd(parsed.chatId);
        return { status: 200 };
      }
      if (this.commandExecutor) {
        const cmd: MessagingCommand = {
          type: MessagingFrameType.Command,
          command: slash.command,
          featureId: slash.featureId,
          args: slash.args,
          chatId: parsed.chatId,
          platform,
        };
        try {
          const reply = await this.commandExecutor.execute(cmd);
          await this.sendReply(parsed.chatId, reply);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          await this.sendReply(parsed.chatId, `Command failed: ${msg}`);
        }
        return { status: 200 };
      }
    }

    // 3. If there's an active chat relay, forward the message to the
    //    interactive session.
    if (this.chatRelay?.hasActiveRelay()) {
      await this.handleChatMessage(parsed.chatId, parsed.text);
      return { status: 200 };
    }

    // 4. Unknown message — ignore silently.
    return { status: 200 };
  }

  private async handleChatStart(
    platform: MessagingPlatform,
    chatId: string,
    featureId?: string
  ): Promise<void> {
    if (!featureId) {
      await this.sendReply(chatId, 'Usage: /chat <feature_id>');
      return;
    }
    if (!this.chatRelay) return;

    const feature = await this.deps.featureRepo.findById(featureId);
    if (!feature) {
      await this.sendReply(chatId, `Feature ${featureId} not found.`);
      return;
    }
    if (!feature.worktreePath) {
      await this.sendReply(
        chatId,
        `Feature ${featureId} has no worktree yet — it may not be checked out.`
      );
      return;
    }

    // Subscribe to the interactive session's stream and forward deltas to
    // the chat relay buffer. The unsubscribe handle is owned by the relay.
    const unsubscribe = this.deps.interactiveSessionService.subscribeByFeature(
      feature.id,
      (chunk) => {
        if (chunk.delta) {
          this.chatRelay?.bufferAgentOutput(chunk.delta);
        }
        if (chunk.done) {
          this.chatRelay?.flushBuffer();
        }
      }
    );

    const message = this.chatRelay.startRelay(
      feature.id,
      chatId,
      platform,
      feature.worktreePath,
      unsubscribe
    );
    await this.sendReply(chatId, message);
  }

  private async handleChatEnd(chatId: string): Promise<void> {
    if (!this.chatRelay) return;
    const message = this.chatRelay.endRelay();
    await this.sendReply(chatId, message);
  }

  private async handleChatMessage(_chatId: string, text: string): Promise<void> {
    if (!this.chatRelay?.hasActiveRelay()) return;
    const featureId = this.chatRelay.getActiveFeatureId();
    const worktreePath = this.chatRelay.getActiveWorktreePath();
    if (!featureId || !worktreePath) return;
    try {
      await this.deps.interactiveSessionService.sendUserMessage(featureId, text, worktreePath);
    } catch {
      // Delivery failures surface as missing agent replies — no point
      // spamming the user's chat with error toasts.
    }
  }

  private platformForRoute(routeId: string): MessagingPlatform | null {
    const { config } = this.deps;
    if (config.telegram?.routeId === routeId) return MessagingPlatform.Telegram;
    if (config.whatsapp?.routeId === routeId) return MessagingPlatform.WhatsApp;
    return null;
  }

  private async handlePairConfirm(
    platform: MessagingPlatform,
    chatId: string,
    code: string
  ): Promise<void> {
    const { config } = this.deps;
    const platformCfg = platform === MessagingPlatform.Telegram ? config.telegram : config.whatsapp;

    if (!platformCfg?.pendingPairingCode || platformCfg.pendingPairingCode !== code) {
      await this.sendReply(chatId, 'Invalid or expired pairing code.');
      return;
    }

    try {
      await this.deps.confirmPairing.execute({ platform, chatId });
      await this.sendReply(
        chatId,
        'Paired with Shep. You can now send commands like /status, /list, or /help.'
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await this.sendReply(chatId, `Pairing failed: ${msg}`);
    }
  }

  private async sendReply(chatId: string, text: string): Promise<void> {
    const botToken = this.deps.telegramBotToken;
    if (!botToken || !text) return;
    try {
      await this.deps.telegramClient.sendMessage({ botToken, chatId, text });
    } catch {
      // Non-fatal — swallow so the tunnel response still completes.
    }
  }
}
