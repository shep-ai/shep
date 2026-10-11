/**
 * Opt-out usage metrics (spec 133): the outbox, the runtime, the PostHog
 * transport, the identity provider, ITelemetry, the use cases, and string
 * aliases for web server actions.
 *
 * Adapters are built by factories (not reflective construction) because their
 * constructors take plain option objects, which erase to `Object` without
 * decorator metadata. Each is cached so the identity cache and the outbox
 * statement handles live for the process.
 */

import { homedir } from 'node:os';
import { instanceCachingFactory, type DependencyContainer } from 'tsyringe';
import type Database from 'better-sqlite3';

import type { ITelemetryOutboxRepository } from '../../../application/ports/output/repositories/telemetry-outbox.repository.interface.js';
import type { IRepositoryRepository } from '../../../application/ports/output/repositories/repository-repository.interface.js';
import type { ITelemetry } from '../../../application/ports/output/services/telemetry.interface.js';
import type { ITelemetryTransport } from '../../../application/ports/output/services/telemetry-transport.interface.js';
import type { ITelemetryIdentityProvider } from '../../../application/ports/output/services/telemetry-identity-provider.interface.js';
import type { ITelemetryRuntime } from '../../../application/ports/output/services/telemetry-runtime.interface.js';
import type { ISettingsProvider } from '../../../application/ports/output/services/settings-provider.interface.js';
import type { IClock } from '../../../application/ports/output/services/clock.interface.js';
import type { IVersionService } from '../../../application/ports/output/services/version-service.interface.js';
import type { IGitHubRepositoryService } from '../../../application/ports/output/services/github-repository-service.interface.js';

import { SQLiteTelemetryOutboxRepository } from '../../repositories/sqlite-telemetry-outbox.repository.js';
import { NodeTelemetryRuntime } from '../../services/telemetry/node-telemetry-runtime.js';
import { PostHogTelemetryTransport } from '../../services/telemetry/posthog-telemetry-transport.js';
import { resolvePostHogConfig } from '../../services/telemetry/telemetry-config.js';
import { OutboxTelemetry } from '../../services/telemetry/outbox-telemetry.js';
import { CatalogTelemetryIdentityProvider } from '../../services/telemetry/catalog-telemetry-identity-provider.js';

import { TelemetryEnvelopeBuilder } from '../../../application/use-cases/telemetry/telemetry-envelope-builder.js';
import { FlushTelemetryUseCase } from '../../../application/use-cases/telemetry/flush-telemetry.use-case.js';
import { GetTelemetryStatusUseCase } from '../../../application/use-cases/telemetry/get-telemetry-status.use-case.js';
import { SetTelemetryPreferencesUseCase } from '../../../application/use-cases/telemetry/set-telemetry-preferences.use-case.js';
import { PreviewTelemetryUseCase } from '../../../application/use-cases/telemetry/preview-telemetry.use-case.js';
import { AcknowledgeTelemetryNoticeUseCase } from '../../../application/use-cases/telemetry/acknowledge-telemetry-notice.use-case.js';
import { RecordInstallHeartbeatUseCase } from '../../../application/use-cases/telemetry/record-install-heartbeat.use-case.js';
import { RecordTelemetryEventUseCase } from '../../../application/use-cases/telemetry/record-telemetry-event.use-case.js';
import { RecordUnhandledErrorUseCase } from '../../../application/use-cases/telemetry/record-unhandled-error.use-case.js';

export function registerTelemetry(container: DependencyContainer): void {
  container.register<ITelemetryOutboxRepository>('ITelemetryOutboxRepository', {
    useFactory: instanceCachingFactory(
      (c) => new SQLiteTelemetryOutboxRepository(c.resolve<Database.Database>('Database'))
    ),
  });
  container.register<ITelemetryRuntime>('ITelemetryRuntime', {
    useFactory: instanceCachingFactory(
      (c) => new NodeTelemetryRuntime(c.resolve<IVersionService>('IVersionService'))
    ),
  });
  container.register<ITelemetryTransport>('ITelemetryTransport', {
    useFactory: instanceCachingFactory(
      () => new PostHogTelemetryTransport(resolvePostHogConfig(process.env))
    ),
  });
  container.register<ITelemetry>('ITelemetry', {
    useFactory: instanceCachingFactory(
      (c) =>
        new OutboxTelemetry(
          c.resolve<ITelemetryOutboxRepository>('ITelemetryOutboxRepository'),
          c.resolve<ISettingsProvider>('ISettingsProvider'),
          c.resolve<ITelemetryRuntime>('ITelemetryRuntime'),
          c.resolve<IClock>('IClock')
        )
    ),
  });
  container.register<ITelemetryIdentityProvider>('ITelemetryIdentityProvider', {
    useFactory: instanceCachingFactory((c) => {
      const runtime = c.resolve<ITelemetryRuntime>('ITelemetryRuntime');
      const github = c.resolve<IGitHubRepositoryService>('IGitHubRepositoryService');
      const repositories = c.resolve<IRepositoryRepository>('IRepositoryRepository');
      return new CatalogTelemetryIdentityProvider({
        homeDir: homedir,
        env: () => runtime.env(),
        sha256: (input) => runtime.sha256(input),
        clock: c.resolve<IClock>('IClock'),
        getGitHubUsername: () => github.getAuthenticatedUser(),
        listRemoteUrls: async () => (await repositories.list()).map((repo) => repo.remoteUrl),
      });
    }),
  });

  container.registerSingleton(TelemetryEnvelopeBuilder);
  container.registerSingleton(FlushTelemetryUseCase);
  container.registerSingleton(GetTelemetryStatusUseCase);
  container.registerSingleton(SetTelemetryPreferencesUseCase);
  container.registerSingleton(PreviewTelemetryUseCase);
  container.registerSingleton(AcknowledgeTelemetryNoticeUseCase);
  container.registerSingleton(RecordInstallHeartbeatUseCase);
  container.registerSingleton(RecordTelemetryEventUseCase);
  container.registerSingleton(RecordUnhandledErrorUseCase);

  // String aliases: web server actions resolve by name (Turbopack cannot
  // follow core's `.js` imports), and so does the daemon's flush watcher.
  container.register('FlushTelemetryUseCase', {
    useFactory: (c) => c.resolve(FlushTelemetryUseCase),
  });
  container.register('GetTelemetryStatusUseCase', {
    useFactory: (c) => c.resolve(GetTelemetryStatusUseCase),
  });
  container.register('SetTelemetryPreferencesUseCase', {
    useFactory: (c) => c.resolve(SetTelemetryPreferencesUseCase),
  });
  container.register('PreviewTelemetryUseCase', {
    useFactory: (c) => c.resolve(PreviewTelemetryUseCase),
  });
  container.register('AcknowledgeTelemetryNoticeUseCase', {
    useFactory: (c) => c.resolve(AcknowledgeTelemetryNoticeUseCase),
  });
  container.register('RecordInstallHeartbeatUseCase', {
    useFactory: (c) => c.resolve(RecordInstallHeartbeatUseCase),
  });
  container.register('RecordTelemetryEventUseCase', {
    useFactory: (c) => c.resolve(RecordTelemetryEventUseCase),
  });
  container.register('RecordUnhandledErrorUseCase', {
    useFactory: (c) => c.resolve(RecordUnhandledErrorUseCase),
  });
}
