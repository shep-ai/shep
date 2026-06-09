/**
 * Get Security State Use Case
 *
 * Returns the current security state for UI projection:
 * - Effective mode from settings
 * - Recent security events (limited)
 * - Highest-severity open finding
 * - Last evaluation timestamp
 */

import { injectable, inject } from 'tsyringe';
import { SecurityMode, SecuritySeverity } from '../../../domain/generated/output.js';
import type { SecurityEvent } from '../../../domain/generated/output.js';
import type { ISecurityEventRepository } from '../../ports/output/repositories/security-event.repository.interface.js';
import type { ISettingsRepository } from '../../ports/output/repositories/settings.repository.interface.js';

/** Maximum number of recent events returned. */
const RECENT_EVENTS_LIMIT = 20;

/**
 * Security state summary for UI projection.
 */
export interface SecurityState {
  /** Effective security mode */
  mode: SecurityMode;
  /** Last evaluation timestamp (ISO string) or null */
  lastEvaluationAt: string | null;
  /** Policy source or null */
  policySource: string | null;
  /** Recent security events (most recent first, limited) */
  recentEvents: SecurityEvent[];
  /** Highest-severity finding from recent events, or null */
  highestSeverityFinding: SecurityEvent | null;
}

/** Severity ordering for comparison (higher = more severe). */
const SEVERITY_RANK: Record<string, number> = {
  [SecuritySeverity.Low]: 0,
  [SecuritySeverity.Medium]: 1,
  [SecuritySeverity.High]: 2,
  [SecuritySeverity.Critical]: 3,
};

@injectable()
export class GetSecurityStateUseCase {
  constructor(
    @inject('ISecurityEventRepository')
    private readonly eventRepository: ISecurityEventRepository,
    @inject('ISettingsRepository')
    private readonly settingsRepository: ISettingsRepository
  ) {}

  async execute(repositoryPath: string): Promise<SecurityState> {
    const settings = await this.settingsRepository.load();
    const securityConfig = settings?.security;

    const recentEvents = await this.eventRepository.findByRepository(repositoryPath, {
      limit: RECENT_EVENTS_LIMIT,
    });

    const highestSeverityFinding = this.findHighestSeverity(recentEvents);

    return {
      mode: securityConfig?.mode ?? SecurityMode.Advisory,
      lastEvaluationAt: securityConfig?.lastEvaluationAt ?? null,
      policySource: securityConfig?.policySource ?? null,
      recentEvents,
      highestSeverityFinding,
    };
  }

  private findHighestSeverity(events: SecurityEvent[]): SecurityEvent | null {
    if (events.length === 0) {
      return null;
    }

    let highest = events[0];
    for (const event of events) {
      const eventRank = SEVERITY_RANK[event.severity] ?? 0;
      const highestRank = SEVERITY_RANK[highest.severity] ?? 0;
      if (eventRank > highestRank) {
        highest = event;
      }
    }

    return highest;
  }
}
