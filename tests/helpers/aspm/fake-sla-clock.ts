/**
 * FakeSlaClock — test fake for ISlaClockPort.
 *
 * Feature 098, phase 6 (task-32 supporting helper). ASPM SLA computation
 * and exception expiry checks read time via {@link ISlaClockPort}; tests
 * inject this fake so the clock is fully controllable.
 *
 * Example:
 *   const clock = new FakeSlaClock(new Date('2026-05-19T12:00:00Z'));
 *   container.registerInstance(ASPM_TOKENS.ISlaClockPort, clock);
 *   clock.advanceDays(8); // SLA window for Critical defaults to 7
 */

import type { ISlaClockPort } from '@/application/ports/output/services/sla-clock-port.interface.js';

export class FakeSlaClock implements ISlaClockPort {
  private current: Date;

  constructor(initial: Date = new Date('2026-01-01T00:00:00.000Z')) {
    this.current = new Date(initial.getTime());
  }

  now(): Date {
    return new Date(this.current.getTime());
  }

  set(date: Date): void {
    this.current = new Date(date.getTime());
  }

  advanceMillis(ms: number): void {
    this.current = new Date(this.current.getTime() + ms);
  }

  advanceDays(days: number): void {
    this.advanceMillis(days * 24 * 60 * 60 * 1000);
  }
}
