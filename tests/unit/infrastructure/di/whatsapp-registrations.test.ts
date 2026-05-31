import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock native/heavy dependencies that container.ts transitively imports.
vi.mock('node-notifier', () => ({ default: { notify: vi.fn() } }));
vi.mock('which', () => ({ default: vi.fn().mockResolvedValue(null) }));
vi.mock('better-sqlite3', () => ({
  default: vi.fn().mockReturnValue({
    pragma: vi.fn(),
    exec: vi.fn(),
    prepare: vi.fn().mockReturnValue({
      run: vi.fn().mockReturnValue({ changes: 0, lastInsertRowid: 0 }),
      get: vi.fn(),
      all: vi.fn(),
    }),
  }),
}));

vi.mock('../../../../packages/core/src/infrastructure/persistence/sqlite/connection.js', () => ({
  getSQLiteConnection: vi.fn().mockResolvedValue({
    pragma: vi.fn(),
    exec: vi.fn(),
    prepare: vi.fn().mockReturnValue({
      run: vi.fn().mockReturnValue({ changes: 0, lastInsertRowid: 0 }),
      get: vi.fn(),
      all: vi.fn(),
    }),
  }),
}));

vi.mock('../../../../packages/core/src/infrastructure/persistence/sqlite/migrations.js', () => ({
  runSQLiteMigrations: vi.fn().mockResolvedValue(undefined),
}));

vi.mock(
  '../../../../packages/core/src/infrastructure/services/notifications/notification-bus.js',
  () => ({ getNotificationBus: vi.fn().mockReturnValue({}) })
);

vi.mock(
  '../../../../packages/core/src/infrastructure/services/agents/common/checkpointer.js',
  () => ({ createCheckpointer: vi.fn().mockReturnValue({}) })
);

const CONTAINER = '../../../../packages/core/src/infrastructure/di/container.js';

describe('WhatsApp DI registrations (spec 101)', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('resolves the thread-mapping repository by string token', async () => {
    const { initializeContainer } = await import(CONTAINER);
    const { SQLiteWhatsAppThreadMappingRepository } = await import(
      '../../../../packages/core/src/infrastructure/repositories/sqlite-whatsapp-thread-mapping.repository.js'
    );
    const container = await initializeContainer();
    expect(container.resolve('IWhatsAppThreadMappingRepository')).toBeInstanceOf(
      SQLiteWhatsAppThreadMappingRepository
    );
  });

  it('resolves both gateway adapters', async () => {
    const { initializeContainer } = await import(CONTAINER);
    const { WhatsAppBaileysGateway } = await import(
      '../../../../packages/core/src/infrastructure/services/whatsapp/whatsapp-baileys.gateway.js'
    );
    const { WhatsAppCloudApiGateway } = await import(
      '../../../../packages/core/src/infrastructure/services/whatsapp/whatsapp-cloud-api.gateway.js'
    );
    const container = await initializeContainer();
    expect(container.resolve(WhatsAppBaileysGateway)).toBeInstanceOf(WhatsAppBaileysGateway);
    expect(container.resolve(WhatsAppCloudApiGateway)).toBeInstanceOf(WhatsAppCloudApiGateway);
  });

  it('resolves the dispatch + reply use cases by string alias', async () => {
    const { initializeContainer } = await import(CONTAINER);
    const { DispatchWhatsAppMessageUseCase } = await import(
      '../../../../packages/core/src/application/use-cases/whatsapp/dispatch-whatsapp-message.use-case.js'
    );
    const { RouteWhatsAppReplyUseCase } = await import(
      '../../../../packages/core/src/application/use-cases/whatsapp/route-whatsapp-reply.use-case.js'
    );
    const container = await initializeContainer();
    expect(container.resolve('DispatchWhatsAppMessageUseCase')).toBeInstanceOf(
      DispatchWhatsAppMessageUseCase
    );
    expect(container.resolve('RouteWhatsAppReplyUseCase')).toBeInstanceOf(
      RouteWhatsAppReplyUseCase
    );
  });

  it('resolves the connection service', async () => {
    const { initializeContainer } = await import(CONTAINER);
    const { WhatsAppConnectionService } = await import(
      '../../../../packages/core/src/infrastructure/services/whatsapp/whatsapp-connection.service.js'
    );
    const container = await initializeContainer();
    expect(container.resolve('WhatsAppConnectionService')).toBeInstanceOf(
      WhatsAppConnectionService
    );
    expect(container.resolve(WhatsAppConnectionService)).toBeInstanceOf(WhatsAppConnectionService);
  });

  it('resolves the WhatsApp notifier and wires it into INotificationService', async () => {
    const { initializeContainer } = await import(CONTAINER);
    const { WhatsAppNotifier } = await import(
      '../../../../packages/core/src/infrastructure/services/whatsapp/whatsapp-notifier.js'
    );
    const container = await initializeContainer();
    expect(container.resolve('IWhatsAppNotifier')).toBeInstanceOf(WhatsAppNotifier);
    // INotificationService must still resolve with the optional channel present.
    expect(() => container.resolve('INotificationService')).not.toThrow();
  });
});
