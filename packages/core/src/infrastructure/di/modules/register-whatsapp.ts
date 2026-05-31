import type { DependencyContainer } from 'tsyringe';
import type Database from 'better-sqlite3';

import type { IWhatsAppThreadMappingRepository } from '../../../application/ports/output/repositories/whatsapp-thread-mapping-repository.interface.js';
import { SQLiteWhatsAppThreadMappingRepository } from '../../repositories/sqlite-whatsapp-thread-mapping.repository.js';
import type { IWhatsAppNotifier } from '../../../application/ports/output/services/whatsapp-notifier.interface.js';
import { WhatsAppBaileysGateway } from '../../services/whatsapp/whatsapp-baileys.gateway.js';
import { WhatsAppCloudApiGateway } from '../../services/whatsapp/whatsapp-cloud-api.gateway.js';
import { WhatsAppConnectionService } from '../../services/whatsapp/whatsapp-connection.service.js';
import { WhatsAppNotifier } from '../../services/whatsapp/whatsapp-notifier.js';
import { DispatchWhatsAppMessageUseCase } from '../../../application/use-cases/whatsapp/dispatch-whatsapp-message.use-case.js';
import { RouteWhatsAppReplyUseCase } from '../../../application/use-cases/whatsapp/route-whatsapp-reply.use-case.js';

/**
 * WhatsApp task-dispatch integration (spec 101).
 *
 * Registers the thread-mapping repository, both gateway adapters, the two
 * inbound use cases (with web-reachable string aliases), and the persistent
 * connection service. The active adapter is selected at runtime by the
 * connection service from Settings.whatsapp.adapter.
 */
export function registerWhatsApp(container: DependencyContainer): void {
  container.register<IWhatsAppThreadMappingRepository>('IWhatsAppThreadMappingRepository', {
    useFactory: (c) => {
      const db = c.resolve<Database.Database>('Database');
      return new SQLiteWhatsAppThreadMappingRepository(db);
    },
  });

  // Both adapters are concrete singletons; the connection service picks one.
  container.registerSingleton(WhatsAppBaileysGateway);
  container.registerSingleton(WhatsAppCloudApiGateway);
  // String alias so the web Cloud API webhook route can resolve the adapter.
  container.register('WhatsAppCloudApiGateway', {
    useFactory: (c) => c.resolve(WhatsAppCloudApiGateway),
  });

  container.registerSingleton(DispatchWhatsAppMessageUseCase);
  container.register('DispatchWhatsAppMessageUseCase', {
    useFactory: (c) => c.resolve(DispatchWhatsAppMessageUseCase),
  });

  container.registerSingleton(RouteWhatsAppReplyUseCase);
  container.register('RouteWhatsAppReplyUseCase', {
    useFactory: (c) => c.resolve(RouteWhatsAppReplyUseCase),
  });

  container.registerSingleton(WhatsAppConnectionService);
  container.register('WhatsAppConnectionService', {
    useFactory: (c) => c.resolve(WhatsAppConnectionService),
  });

  container.registerSingleton(WhatsAppNotifier);
  container.register<IWhatsAppNotifier>('IWhatsAppNotifier', {
    useFactory: (c) => c.resolve(WhatsAppNotifier),
  });
}
