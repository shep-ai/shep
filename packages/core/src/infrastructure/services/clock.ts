/**
 * Real Clock Service
 *
 * Infrastructure implementation of IClock that returns the actual system time.
 * Used in production; tests substitute a MockClock for deterministic behavior.
 */

import { injectable } from 'tsyringe';

import type { IClock } from '../../application/ports/output/services/clock.interface.js';

@injectable()
export class RealClock implements IClock {
  now(): Date {
    return new Date();
  }
}
