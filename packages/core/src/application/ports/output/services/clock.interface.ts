/**
 * Clock Service Interface
 *
 * Output port for reading the current time. Enables deterministic testing
 * of time-dependent logic (cron evaluation, nextRunAt calculation, retention
 * cleanup) without relying on system time or Vitest fake timers.
 *
 * Following Clean Architecture:
 * - Application layer depends on this interface
 * - Infrastructure layer provides concrete implementation (RealClock)
 * - Tests provide MockClock with controllable time
 */

/**
 * Port interface for reading the current time.
 *
 * Implementations must:
 * - Return a Date representing the current moment
 * - Be safe to call frequently (no side effects)
 */
export interface IClock {
  /**
   * Get the current date and time.
   *
   * @returns A Date representing the current moment
   */
  now(): Date;
}
