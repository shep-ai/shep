/**
 * Record Install Heartbeat Use Case (spec 133)
 *
 * At most once a day per install, record `install.heartbeat` with the
 * configured agent, the names of enabled feature flags, and counts of
 * repositories and running features. Daily/weekly actives and retention are
 * computed from it. Called by the daemon's flush watcher.
 */

import { injectable, inject } from 'tsyringe';
import { TelemetryEvent } from '../../../domain/generated/output.js';
import type { ISettingsRepository } from '../../ports/output/repositories/settings.repository.interface.js';
import type { IRepositoryRepository } from '../../ports/output/repositories/repository-repository.interface.js';
import type { IFeatureRepository } from '../../ports/output/repositories/feature-repository.interface.js';
import type { ITelemetry } from '../../ports/output/services/telemetry.interface.js';
import type { ITelemetryRuntime } from '../../ports/output/services/telemetry-runtime.interface.js';
import type { IClock } from '../../ports/output/services/clock.interface.js';
import {
  resolveTelemetryState,
  telemetryConfigOf,
} from '../../../domain/shared/telemetry/telemetry-state.js';
import { TELEMETRY_HEARTBEAT_INTERVAL_MS } from '../../../domain/shared/telemetry/telemetry-delivery.js';
import { RUNNING_LIFECYCLES } from '../../../domain/shared/parallel-feature-limit.js';

@injectable()
export class RecordInstallHeartbeatUseCase {
  constructor(
    @inject('ISettingsRepository')
    private readonly settingsRepository: ISettingsRepository,
    @inject('ITelemetry')
    private readonly telemetry: ITelemetry,
    @inject('IRepositoryRepository')
    private readonly repositories: IRepositoryRepository,
    @inject('IFeatureRepository')
    private readonly features: IFeatureRepository,
    @inject('ITelemetryRuntime')
    private readonly runtime: ITelemetryRuntime,
    @inject('IClock')
    private readonly clock: IClock
  ) {}

  /** @returns true when a heartbeat was recorded */
  async execute(): Promise<boolean> {
    const settings = await this.settingsRepository.load();
    if (!settings || !resolveTelemetryState(this.runtime.env(), settings.telemetry).enabled) {
      return false;
    }
    const now = this.clock.now();
    const last = settings.telemetry?.lastHeartbeatAt;
    if (last && now.getTime() - new Date(last).getTime() < TELEMETRY_HEARTBEAT_INTERVAL_MS) {
      return false;
    }

    const enabledFeatureFlags = Object.entries(settings.featureFlags ?? {})
      .filter(([, on]) => on === true)
      .map(([name]) => name)
      .sort();
    this.telemetry.record(TelemetryEvent.InstallHeartbeat, {
      agentType: settings.agent.type,
      enabledFeatureFlags,
      repositoryCount: (await this.repositories.list()).length,
      activeFeatureCount: await this.features.countByLifecycles([...RUNNING_LIFECYCLES]),
    });

    const latest = (await this.settingsRepository.load()) ?? settings;
    await this.settingsRepository.update({
      ...latest,
      telemetry: {
        ...telemetryConfigOf(latest),
        lastHeartbeatAt: now,
      },
    });
    return true;
  }
}
