/**
 * Telemetry Envelope Builder (spec 133)
 *
 * Turns queued outbox entries into the envelopes that leave the machine. It is
 * the one place that decides what is attached to an event at send time:
 * - distinct id: always the install id (assigned and persisted on first use)
 * - platform: Shep version, OS, arch, Node version
 * - contact consent flag
 * - identity (agent account hash, GitHub username and owners) only while
 *   "Include my identity" is on — applied here, so turning identity off also
 *   covers events that were queued before.
 */

import { injectable, inject } from 'tsyringe';
import type { Settings, TelemetryConfig } from '../../../domain/generated/output.js';
import type { ISettingsRepository } from '../../ports/output/repositories/settings.repository.interface.js';
import { telemetryConfigOf } from '../../../domain/shared/telemetry/telemetry-state.js';
import type { TelemetryOutboxEntry } from '../../ports/output/repositories/telemetry-outbox.repository.interface.js';
import type { TelemetryEnvelope } from '../../ports/output/services/telemetry-transport.interface.js';
import type { ITelemetryIdentityProvider } from '../../ports/output/services/telemetry-identity-provider.interface.js';
import type { ITelemetryRuntime } from '../../ports/output/services/telemetry-runtime.interface.js';
import type {
  TelemetryProperties,
  TelemetryPropertyValue,
} from '../../ports/output/services/telemetry-events.js';

@injectable()
export class TelemetryEnvelopeBuilder {
  constructor(
    @inject('ISettingsRepository')
    private readonly settingsRepository: ISettingsRepository,
    @inject('ITelemetryIdentityProvider')
    private readonly identityProvider: ITelemetryIdentityProvider,
    @inject('ITelemetryRuntime')
    private readonly runtime: ITelemetryRuntime
  ) {}

  async build(
    entries: readonly TelemetryOutboxEntry[],
    settings: Settings
  ): Promise<TelemetryEnvelope[]> {
    if (entries.length === 0) return [];
    const telemetry = telemetryConfigOf(settings);
    const installId = await this.ensureInstallId(settings, telemetry);
    const shared = await this.sharedProperties(settings, telemetry);

    return entries.map((entry) => ({
      uuid: entry.id,
      event: entry.event,
      distinctId: installId,
      timestamp: entry.capturedAt,
      properties: { ...entry.properties, ...shared.properties },
      ...(shared.person ? { personProperties: shared.person } : {}),
    }));
  }

  private async sharedProperties(
    settings: Settings,
    telemetry: TelemetryConfig
  ): Promise<{ properties: TelemetryProperties; person?: TelemetryProperties }> {
    const platform = this.runtime.platform();
    const base: Record<string, TelemetryPropertyValue> = {
      shepVersion: platform.shepVersion,
      os: platform.os,
      arch: platform.arch,
      nodeVersion: platform.nodeVersion,
      contactConsent: telemetry.contactConsent,
    };
    if (!telemetry.includeIdentity) return { properties: base };

    const identity = await this.identityProvider.resolve(settings.agent.type);
    const identityProperties: Record<string, TelemetryPropertyValue> = {
      ...(identity.agentAccountHash ? { agentAccountHash: identity.agentAccountHash } : {}),
      ...(identity.agentAccountSource ? { agentAccountSource: identity.agentAccountSource } : {}),
      ...(identity.githubUsername ? { githubUsername: identity.githubUsername } : {}),
      githubOwners: identity.githubOwners,
    };
    return {
      properties: { ...base, ...identityProperties },
      person: {
        ...(identity.githubUsername ? { githubUsername: identity.githubUsername } : {}),
        githubOwners: identity.githubOwners,
        contactConsent: telemetry.contactConsent,
      },
    };
  }

  /** The install id, assigned and persisted when an older install has none. */
  private async ensureInstallId(settings: Settings, telemetry: TelemetryConfig): Promise<string> {
    if (telemetry.installId) return telemetry.installId;
    const installId = this.runtime.randomUuid();
    const current = (await this.settingsRepository.load()) ?? settings;
    await this.settingsRepository.update({
      ...current,
      telemetry: { ...telemetryConfigOf(current), installId },
    });
    return installId;
  }
}
