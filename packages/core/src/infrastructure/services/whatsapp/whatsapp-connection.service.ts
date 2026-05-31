/**
 * WhatsApp Connection Service (spec 101)
 *
 * Persistent background service that owns the WhatsApp socket lifecycle,
 * following the NotificationWatcherService pattern (start / stop / isRunning).
 * It selects the configured adapter, connects, and routes every inbound
 * message to the right use case — dispatch (new thread) or reply routing
 * (bound thread) — then renders the localized outcome and sends it back.
 *
 * All decisions live in the use cases; this service only selects the adapter,
 * wires the inbound pipe, and transports the rendered reply.
 */

import { injectable, inject } from 'tsyringe';

import type {
  IWhatsAppGateway,
  WhatsAppInboundMessage,
  WhatsAppConnectionInfo,
} from '../../../application/ports/output/services/whatsapp-gateway.interface.js';
import type { IWhatsAppThreadMappingRepository } from '../../../application/ports/output/repositories/whatsapp-thread-mapping-repository.interface.js';
import type { ISettingsRepository } from '../../../application/ports/output/repositories/settings.repository.interface.js';
import type { ILogger } from '../../../application/ports/output/services/logger.interface.js';
import { DispatchWhatsAppMessageUseCase } from '../../../application/use-cases/whatsapp/dispatch-whatsapp-message.use-case.js';
import { RouteWhatsAppReplyUseCase } from '../../../application/use-cases/whatsapp/route-whatsapp-reply.use-case.js';
import {
  Language,
  WhatsAppAdapterKind,
  WhatsAppConnectionStatus,
} from '../../../domain/generated/output.js';
import { renderWhatsAppMessage } from './whatsapp-message-templates.js';
import { WhatsAppBaileysGateway } from './whatsapp-baileys.gateway.js';
import { WhatsAppCloudApiGateway } from './whatsapp-cloud-api.gateway.js';

@injectable()
export class WhatsAppConnectionService {
  private running = false;
  private gateway: IWhatsAppGateway | null = null;
  private inboundWired = false;

  constructor(
    @inject('ISettingsRepository') private readonly settingsRepository: ISettingsRepository,
    @inject(WhatsAppBaileysGateway) private readonly baileys: WhatsAppBaileysGateway,
    @inject(WhatsAppCloudApiGateway) private readonly cloudApi: WhatsAppCloudApiGateway,
    @inject(DispatchWhatsAppMessageUseCase)
    private readonly dispatchUseCase: DispatchWhatsAppMessageUseCase,
    @inject(RouteWhatsAppReplyUseCase)
    private readonly routeReplyUseCase: RouteWhatsAppReplyUseCase,
    @inject('IWhatsAppThreadMappingRepository')
    private readonly threadMappings: IWhatsAppThreadMappingRepository,
    @inject('ILogger') private readonly logger: ILogger
  ) {}

  isRunning(): boolean {
    return this.running;
  }

  getConnectionInfo(): WhatsAppConnectionInfo {
    return this.gateway?.getConnectionInfo() ?? { status: WhatsAppConnectionStatus.Disconnected };
  }

  /** The active gateway (for the Cloud API webhook route to forward payloads). */
  getActiveGateway(): IWhatsAppGateway | null {
    return this.gateway;
  }

  private selectGateway(adapter: WhatsAppAdapterKind): IWhatsAppGateway {
    return adapter === WhatsAppAdapterKind.CloudApi ? this.cloudApi : this.baileys;
  }

  /**
   * Start the connection if the feature flag is on and the integration is
   * enabled. No-op otherwise (and idempotent).
   */
  async start(): Promise<void> {
    if (this.running) return;

    const settings = await this.settingsRepository.load();
    if (!settings?.featureFlags?.whatsappDispatch || !settings.whatsapp?.enabled) {
      this.logger.info('[whatsapp] dispatch disabled or flag off; connection service not started');
      return;
    }

    this.gateway = this.selectGateway(settings.whatsapp.adapter);
    if (!this.inboundWired) {
      this.gateway.onInbound((msg) => this.handleInbound(msg));
      this.inboundWired = true;
    }

    try {
      await this.gateway.connect();
      this.running = true;
      this.logger.info('[whatsapp] connection service started', {
        adapter: settings.whatsapp.adapter,
      });
    } catch (err) {
      this.logger.error('[whatsapp] failed to start connection service', {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  async stop(): Promise<void> {
    if (this.gateway) {
      await this.gateway.disconnect().catch(() => undefined);
    }
    this.running = false;
  }

  /**
   * Route one inbound message: reply-routing when the thread is already bound,
   * dispatch otherwise. Renders the outcome in the user's language and sends it.
   */
  async handleInbound(message: WhatsAppInboundMessage): Promise<void> {
    try {
      const mapping = await this.threadMappings.findByThread(message.threadId);
      const outcome = mapping?.active
        ? await this.routeReplyUseCase.execute({ mapping, text: message.text })
        : await this.dispatchUseCase.execute(message);

      const settings = await this.settingsRepository.load();
      const locale = (settings?.user?.preferredLanguage as Language) ?? Language.English;
      const text = renderWhatsAppMessage(outcome.message, locale);

      if (this.gateway) {
        await this.gateway.sendMessage(message.threadId, text);
      }
    } catch (err) {
      this.logger.error('[whatsapp] failed to handle inbound message', {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
}
