/**
 * Record Security Event Use Case
 *
 * Persists a security event and triggers 90-day retention cleanup.
 * Used by runtime guardrails and enforcement flow to record findings.
 */

import { injectable, inject } from 'tsyringe';
import type { SecurityEvent } from '../../../domain/generated/output.js';
import type { ISecurityEventRepository } from '../../ports/output/repositories/security-event.repository.interface.js';
import { randomUUID } from 'node:crypto';

/** Retention window in days for security events. */
const SECURITY_EVENT_RETENTION_DAYS = 90;

@injectable()
export class RecordSecurityEventUseCase {
  constructor(
    @inject('ISecurityEventRepository')
    private readonly eventRepository: ISecurityEventRepository
  ) {}

  async execute(event: SecurityEvent): Promise<void> {
    // Ensure the event has an ID
    const eventToSave: SecurityEvent = {
      ...event,
      id: event.id || randomUUID(),
    };

    await this.eventRepository.save(eventToSave);

    // Trigger 90-day retention cleanup
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - SECURITY_EVENT_RETENTION_DAYS);
    await this.eventRepository.deleteOlderThan(cutoff);
  }
}
